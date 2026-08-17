export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
	role: ChatRole;
	content: string;
}

export interface ChatRequest {
	model: string;
	messages: ChatMessage[];
	temperature?: number;
	maxTokens?: number;
}

export interface TokenUsage {
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
}

export type ProviderEvent =
	| { type: 'delta'; text: string }
	| { type: 'usage'; usage: TokenUsage };

export interface ProviderStream {
	providerRequestId?: string;
	events: AsyncIterable<ProviderEvent>;
}

export interface ModelProvider {
	readonly name: string;
	readonly modelId: string;
	stream(request: ChatRequest, signal: AbortSignal): Promise<ProviderStream>;
}

export class ProviderError extends Error {
	public constructor(
		message: string,
		public readonly code: string,
		public readonly retryable: boolean,
		public readonly statusCode = 502,
	) {
		super(message);
		this.name = 'ProviderError';
	}
}
