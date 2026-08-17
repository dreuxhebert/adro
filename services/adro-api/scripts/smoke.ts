import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildApp } from '../src/app.js';
import { FakeModelProvider } from '../src/fake-provider.js';
import type { ModelProvider, ProviderEvent, ProviderStream } from '../src/provider.js';
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

class WaitingProvider implements ModelProvider {
	public readonly name = 'fake';
	public readonly modelId = 'adro-fake';

	public async stream(_request: unknown, signal: AbortSignal): Promise<ProviderStream> {
		return {
			events: (async function* (): AsyncGenerator<ProviderEvent> {
				await new Promise<void>(resolve => {
					signal.addEventListener('abort', () => resolve(), { once: true });
				});
				yield { type: 'delta', text: 'not sent' };
			})(),
		};
	}
}

async function readBody(url: string, init?: RequestInit): Promise<{ status: number; payload: string }> {
	const response = await fetch(url, init);
	return { status: response.status, payload: await response.text() };
}

function eventTypes(payload: string): string[] {
	return [...payload.matchAll(/^event: (.+)$/gm)].map(match => match[1] ?? '');
}

const usageStore = new MemoryUsageStore();
const app = buildApp({
	nodeEnv: 'development',
	provider: new FakeModelProvider('adro-fake'),
	usageStore,
});
await app.listen({ host: '127.0.0.1', port: 0 });
const port = (app.server.address() as AddressInfo).port;
const baseUrl = `http://127.0.0.1:${port}`;
let modelsPayload: unknown;

try {
	const health = await readBody(`${baseUrl}/health`);
	const models = await readBody(`${baseUrl}/v1/models`);
	modelsPayload = JSON.parse(models.payload);
	const stream = await readBody(`${baseUrl}/v1/chat/stream`, {
		method: 'POST',
		headers: {
			accept: 'text/event-stream',
			'content-type': 'application/json',
			'x-adro-dev-user': 'development',
		},
		body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello from Adro' }] }),
	});
	if (health.status !== 200 || JSON.parse(health.payload).status !== 'ok') {
		throw new Error(`Health check failed: ${health.payload}`);
	}
	if (!eventTypes(stream.payload).includes('delta') || eventTypes(stream.payload).at(-1) !== 'done') {
		throw new Error(`Streaming response was incomplete: ${stream.payload}`);
	}
} finally {
	await app.close();
}

const cancelStore = new MemoryUsageStore();
const cancelApp = buildApp({
	nodeEnv: 'development',
	provider: new WaitingProvider(),
	usageStore: cancelStore,
});
await cancelApp.listen({ host: '127.0.0.1', port: 0 });
const cancelPort = (cancelApp.server.address() as AddressInfo).port;

try {
	await new Promise<void>((resolve, reject) => {
		const request = http.request({
			host: '127.0.0.1',
			port: cancelPort,
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
	const started = Date.now();
	while (cancelStore.events.length === 0 && Date.now() - started < 5000) {
		await new Promise(resolve => setTimeout(resolve, 50));
	}
	if (cancelStore.events[0]?.status !== 'cancelled') {
		throw new Error(`Expected cancelled usage, got ${JSON.stringify(cancelStore.events)}`);
	}
} finally {
	await cancelApp.close();
}

const errorStore = new MemoryUsageStore();
const errorApp = buildApp({
	nodeEnv: 'development',
	provider: {
		name: 'fake',
		modelId: 'adro-fake',
		stream: async () => {
			throw new ProviderError('Provider is busy.', 'rate_limited', true);
		},
	},
	usageStore: errorStore,
});
await errorApp.listen({ host: '127.0.0.1', port: 0 });
const errorPort = (errorApp.server.address() as AddressInfo).port;

try {
	const errorStream = await readBody(`http://127.0.0.1:${errorPort}/v1/chat/stream`, {
		method: 'POST',
		headers: {
			accept: 'text/event-stream',
			'content-type': 'application/json',
			'x-adro-dev-user': 'development',
		},
		body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello' }] }),
	});
	if (!eventTypes(errorStream.payload).includes('error') || errorStore.events[0]?.status !== 'error') {
		throw new Error(`Provider error was not recorded: ${errorStream.payload}`);
	}
} finally {
	await errorApp.close();
}

console.log(JSON.stringify({
	health: 'ok',
	models: modelsPayload,
	stream: 'completed',
	cancellation: 'recorded',
	providerError: 'recorded',
	usage: [...usageStore.events, ...cancelStore.events, ...errorStore.events].map(event => event.status),
}, undefined, 2));
