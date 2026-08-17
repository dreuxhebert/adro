import { afterEach, describe, expect, test, vi } from 'vitest';
import { OpenAiCompatibleProvider } from '../src/openai-compatible-provider.js';
import { ProviderError } from '../src/provider.js';

afterEach(() => {
	vi.unstubAllGlobals();
});

function sseResponse(chunks: string[], status = 200, headers: Record<string, string> = {}): Response {
	const encoder = new TextEncoder();
	let index = 0;
	const body = new ReadableStream<Uint8Array>({
		pull(controller) {
			if (index >= chunks.length) {
				controller.close();
				return;
			}
			controller.enqueue(encoder.encode(chunks[index]));
			index += 1;
		},
	});
	return new Response(body, {
		status,
		headers: { 'content-type': 'text/event-stream', ...headers },
	});
}

describe('OpenAI-compatible provider', () => {
	test('streams fragmented deltas then usage', async () => {
		const fetchImplementation = vi.fn(async () => sseResponse([
			'data: {"choices":[{"delta":{"content":"Hel',
			'lo"}}]}\n\n',
			'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
			'data: {"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}\n\n',
			'data: [DONE]\n\n',
		], 200, { 'x-request-id': 'upstream-1' }));
		const provider = new OpenAiCompatibleProvider({
			baseUrl: 'https://example.test/v1',
			apiKey: 'secret',
			modelId: 'test-model',
			fetch: fetchImplementation,
		});

		const stream = await provider.stream({
			model: 'test-model',
			messages: [{ role: 'user', content: 'Hi' }],
		}, new AbortController().signal);
		const events = [];
		for await (const event of stream.events) {
			events.push(event);
		}

		const requestUrl = fetchImplementation.mock.calls.at(0)?.at(0);
		expect(requestUrl).toBe('https://example.test/v1/chat/completions');
		expect({
			providerRequestId: stream.providerRequestId,
			events,
		}).toEqual({
			providerRequestId: 'upstream-1',
			events: [
				{ type: 'delta', text: 'Hello' },
				{ type: 'delta', text: ' world' },
				{ type: 'usage', usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 } },
			],
		});
	});

	test('maps provider HTTP failures to retryable errors', async () => {
		const provider = new OpenAiCompatibleProvider({
			baseUrl: 'https://example.test/v1',
			apiKey: 'secret',
			modelId: 'test-model',
			fetch: async () => new Response('busy', { status: 429 }),
		});

		await expect(provider.stream({
			model: 'test-model',
			messages: [{ role: 'user', content: 'Hi' }],
		}, new AbortController().signal)).rejects.toMatchObject({
			name: 'ProviderError',
			code: 'provider_http_error',
			retryable: true,
		} satisfies Partial<ProviderError>);
	});
});
