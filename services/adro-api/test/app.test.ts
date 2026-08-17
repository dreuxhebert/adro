import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type { ChatRequest, ModelProvider, ProviderEvent, ProviderStream } from '../src/provider.js';
import { ProviderError } from '../src/provider.js';
import type { UsageEvent, UsageStore } from '../src/usage-store.js';

class MemoryUsageStore implements UsageStore {
	public readonly events: UsageEvent[] = [];

	public async resolveDevelopmentUser(subject: string): Promise<string | undefined> {
		return subject === 'development' ? '00000000-0000-4000-8000-000000000001' : undefined;
	}

	public async append(event: UsageEvent): Promise<void> {
		this.events.push(event);
	}
}

class FakeProvider implements ModelProvider {
	public readonly name = 'fake';
	public readonly modelId = 'fake-model';
	public streamImplementation: (request: ChatRequest, signal: AbortSignal) => Promise<ProviderStream>;

	public constructor(events: ProviderEvent[] = []) {
		this.streamImplementation = async () => ({
			providerRequestId: 'provider-request-1',
			events: (async function* (): AsyncGenerator<ProviderEvent> {
				for (const event of events) {
					yield event;
				}
			})(),
		});
	}

	public stream(request: ChatRequest, signal: AbortSignal): Promise<ProviderStream> {
		return this.streamImplementation(request, signal);
	}
}

const apps: Array<ReturnType<typeof buildApp>> = [];

afterEach(async () => {
	await Promise.all(apps.splice(0).map(app => app.close()));
});

function createApp(provider = new FakeProvider(), usageStore = new MemoryUsageStore()) {
	const app = buildApp({ nodeEnv: 'development', provider, usageStore });
	apps.push(app);
	return { app, usageStore };
}

function eventTypes(payload: string): string[] {
	return [...payload.matchAll(/^event: (.+)$/gm)].map(match => match[1] ?? '');
}

describe('Adro API', () => {
	test('reports health and lists the configured model', async () => {
		const { app } = createApp();
		const [health, models] = await Promise.all([
			app.inject({ method: 'GET', url: '/health' }),
			app.inject({ method: 'GET', url: '/v1/models' }),
		]);

		expect({
			health: { status: health.statusCode, body: health.json() },
			models: { status: models.statusCode, body: models.json() },
		}).toEqual({
			health: { status: 200, body: { status: 'ok' } },
			models: {
				status: 200,
				body: { data: [{ id: 'fake-model', provider: 'fake', streaming: true }] },
			},
		});
	});

	test('streams ordered events and persists completed usage', async () => {
		const provider = new FakeProvider([
			{ type: 'delta', text: 'Hello' },
			{ type: 'delta', text: ' world' },
			{ type: 'usage', usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 } },
		]);
		const { app, usageStore } = createApp(provider);

		const response = await app.inject({
			method: 'POST',
			url: '/v1/chat/stream',
			headers: { 'x-adro-dev-user': 'development' },
			payload: { messages: [{ role: 'user', content: 'Say hello' }] },
		});

		expect({
			status: response.statusCode,
			contentType: response.headers['content-type'],
			events: eventTypes(response.payload),
			usage: usageStore.events.map(event => ({
				providerRequestId: event.providerRequestId,
				status: event.status,
				usage: event.usage,
			})),
		}).toEqual({
			status: 200,
			contentType: 'text/event-stream; charset=utf-8',
			events: ['metadata', 'delta', 'delta', 'usage', 'done'],
			usage: [{
				providerRequestId: 'provider-request-1',
				status: 'completed',
				usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 },
			}],
		});
	});

	test('rejects malformed requests before invoking the provider', async () => {
		const provider = new FakeProvider();
		const stream = vi.spyOn(provider, 'stream');
		const { app } = createApp(provider);

		const response = await app.inject({
			method: 'POST',
			url: '/v1/chat/stream',
			headers: { 'x-adro-dev-user': 'development' },
			payload: {
				model: 'unlisted-model',
				messages: [{ role: 'tool', content: '' }],
				unexpected: true,
			},
		});

		expect({ status: response.statusCode, providerCalls: stream.mock.calls.length }).toEqual({
			status: 400,
			providerCalls: 0,
		});
	});

	test('emits error then done and persists provider failures', async () => {
		const provider = new FakeProvider();
		provider.streamImplementation = async () => {
			throw new ProviderError('Provider is busy.', 'rate_limited', true);
		};
		const { app, usageStore } = createApp(provider);

		const response = await app.inject({
			method: 'POST',
			url: '/v1/chat/stream',
			headers: { 'x-adro-dev-user': 'development' },
			payload: { messages: [{ role: 'user', content: 'Hello' }] },
		});

		expect({
			events: eventTypes(response.payload),
			errorIncluded: response.payload.includes('"code":"rate_limited"'),
			persisted: usageStore.events.map(event => ({
				status: event.status,
				errorCode: event.errorCode,
			})),
		}).toEqual({
			events: ['metadata', 'error', 'done'],
			errorIncluded: true,
			persisted: [{ status: 'error', errorCode: 'rate_limited' }],
		});
	});

	test('rejects the development identity header outside development', async () => {
		const provider = new FakeProvider();
		const store = new MemoryUsageStore();
		const app = buildApp({ nodeEnv: 'production', provider, usageStore: store });
		apps.push(app);

		const response = await app.inject({
			method: 'POST',
			url: '/v1/chat/stream',
			headers: { 'x-adro-dev-user': 'development' },
			payload: { messages: [{ role: 'user', content: 'Hello' }] },
		});

		expect(response.statusCode).toBe(400);
	});

	test('aborts provider work and records cancellation when the client disconnects', async () => {
		const provider = new FakeProvider();
		let observedAbort = false;
		provider.streamImplementation = async (_request, signal) => ({
			events: (async function* (): AsyncGenerator<ProviderEvent> {
				await new Promise<void>(resolve => {
					signal.addEventListener('abort', () => {
						observedAbort = true;
						resolve();
					}, { once: true });
				});
				yield { type: 'delta', text: 'not sent' };
			})(),
		});
		const { app, usageStore } = createApp(provider);
		await app.listen({ host: '127.0.0.1', port: 0 });
		const address = app.server.address() as AddressInfo;

		await new Promise<void>((resolve, reject) => {
			const request = http.request({
				host: '127.0.0.1',
				port: address.port,
				path: '/v1/chat/stream',
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'x-adro-dev-user': 'development',
				},
			}, response => {
				response.once('data', () => {
					response.destroy();
					resolve();
				});
			});
			request.once('error', reject);
			request.end(JSON.stringify({ messages: [{ role: 'user', content: 'Hello' }] }));
		});

		await vi.waitFor(() => expect(usageStore.events).toHaveLength(1));
		expect({
			providerObservedAbort: observedAbort,
			status: usageStore.events[0]?.status,
		}).toEqual({ providerObservedAbort: true, status: 'cancelled' });
	});
});
