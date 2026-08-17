import type { ChatRequest, ModelProvider, ProviderEvent, ProviderStream } from './provider.js';

export class FakeModelProvider implements ModelProvider {
	public readonly name = 'fake';

	public constructor(public readonly modelId: string) {}

	public async stream(request: ChatRequest, signal: AbortSignal): Promise<ProviderStream> {
		const lastUser = [...request.messages].reverse().find(message => message.role === 'user');
		const prompt = lastUser?.content ?? '';
		const reply = prompt.length > 0 ? `Echo: ${prompt}` : 'Hello from Adro.';

		return {
			providerRequestId: 'fake-provider-request',
			events: this.emit(reply, signal),
		};
	}

	private async *emit(reply: string, signal: AbortSignal): AsyncGenerator<ProviderEvent> {
		for (const text of chunkText(reply, 12)) {
			if (signal.aborted) {
				throw signal.reason instanceof Error ? signal.reason : new Error('Aborted');
			}
			yield { type: 'delta', text };
		}

		yield {
			type: 'usage',
			usage: {
				inputTokens: Math.max(1, Math.ceil(reply.length / 8)),
				outputTokens: Math.max(1, Math.ceil(reply.length / 4)),
				totalTokens: Math.max(2, Math.ceil(reply.length / 8) + Math.ceil(reply.length / 4)),
			},
		};
	}
}

function chunkText(value: string, size: number): string[] {
	const chunks: string[] = [];
	for (let index = 0; index < value.length; index += size) {
		chunks.push(value.slice(index, index + size));
	}
	return chunks.length > 0 ? chunks : [value];
}
