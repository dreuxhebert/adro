import {
	type ChatRequest,
	type ModelProvider,
	type ProviderEvent,
	ProviderError,
	type ProviderStream,
	type TokenUsage,
} from './provider.js';

interface OpenAiChunk {
	choices?: Array<{ delta?: { content?: string | null } }>;
	usage?: {
		prompt_tokens?: number;
		completion_tokens?: number;
		total_tokens?: number;
	};
}

export interface OpenAiCompatibleProviderOptions {
	baseUrl: string;
	apiKey: string;
	modelId: string;
	fetch?: typeof fetch;
}

export class OpenAiCompatibleProvider implements ModelProvider {
	public readonly name = 'openai-compatible';
	public readonly modelId: string;
	private readonly fetchImplementation: typeof fetch;

	public constructor(private readonly options: OpenAiCompatibleProviderOptions) {
		this.modelId = options.modelId;
		this.fetchImplementation = options.fetch ?? fetch;
	}

	public async stream(request: ChatRequest, signal: AbortSignal): Promise<ProviderStream> {
		let response: Response;
		try {
			response = await this.fetchImplementation(`${this.options.baseUrl}/chat/completions`, {
				method: 'POST',
				headers: {
					authorization: `Bearer ${this.options.apiKey}`,
					'content-type': 'application/json',
				},
				body: JSON.stringify({
					model: request.model,
					messages: request.messages,
					stream: true,
					stream_options: { include_usage: true },
					...(request.temperature === undefined ? {} : { temperature: request.temperature }),
					...(request.maxTokens === undefined ? {} : { max_tokens: request.maxTokens }),
				}),
				signal,
			});
		} catch (error) {
			if (signal.aborted) {
				throw error;
			}
			throw new ProviderError('The model provider could not be reached.', 'provider_unavailable', true);
		}

		if (!response.ok) {
			await response.body?.cancel().catch(() => undefined);
			throw new ProviderError(
				`The model provider returned HTTP ${response.status}.`,
				'provider_http_error',
				response.status === 408 || response.status === 429 || response.status >= 500,
				502,
			);
		}
		if (!response.body) {
			throw new ProviderError('The model provider returned no response body.', 'provider_protocol_error', false);
		}

		const providerRequestId = response.headers.get('x-request-id') ?? undefined;
		return {
			...(providerRequestId ? { providerRequestId } : {}),
			events: this.readEvents(response.body, signal),
		};
	}

	private async *readEvents(body: ReadableStream<Uint8Array>, signal: AbortSignal): AsyncGenerator<ProviderEvent> {
		const reader = body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					buffer += decoder.decode();
					break;
				}
				buffer += decoder.decode(value, { stream: true });
				const blocks = buffer.split(/\r?\n\r?\n/);
				buffer = blocks.pop() ?? '';
				for (const block of blocks) {
					const event = this.parseBlock(block);
					if (event) {
						yield event;
					}
				}
			}
			if (buffer.trim()) {
				const event = this.parseBlock(buffer);
				if (event) {
					yield event;
				}
			}
		} finally {
			if (signal.aborted) {
				await reader.cancel().catch(() => undefined);
			}
			reader.releaseLock();
		}
	}

	private parseBlock(block: string): ProviderEvent | undefined {
		const data = block
			.split(/\r?\n/)
			.filter(line => line.startsWith('data:'))
			.map(line => line.slice(5).trimStart())
			.join('\n');
		if (!data || data === '[DONE]') {
			return undefined;
		}

		let chunk: OpenAiChunk;
		try {
			chunk = JSON.parse(data) as OpenAiChunk;
		} catch {
			throw new ProviderError('The model provider returned invalid streaming JSON.', 'provider_protocol_error', false);
		}

		const text = chunk.choices?.[0]?.delta?.content;
		if (text) {
			return { type: 'delta', text };
		}
		if (chunk.usage) {
			const usage: TokenUsage = {
				inputTokens: chunk.usage.prompt_tokens ?? 0,
				outputTokens: chunk.usage.completion_tokens ?? 0,
				totalTokens: chunk.usage.total_tokens ?? 0,
			};
			return { type: 'usage', usage };
		}
		return undefined;
	}
}
