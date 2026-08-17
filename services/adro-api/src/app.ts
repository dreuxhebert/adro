import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import type { ChatMessage, ModelProvider, TokenUsage } from './provider.js';
import { ProviderError } from './provider.js';
import type { UsageStatus, UsageStore } from './usage-store.js';

interface ChatBody {
	model?: string;
	messages: ChatMessage[];
	temperature?: number;
	maxTokens?: number;
}

export interface BuildAppOptions {
	nodeEnv: 'development' | 'test' | 'production';
	provider: ModelProvider;
	usageStore: UsageStore;
	logger?: boolean;
}

const headersSchema = {
	type: 'object',
	properties: {
		'x-adro-dev-user': { type: 'string', minLength: 1, maxLength: 128, pattern: '^[a-zA-Z0-9._@-]+$' },
	},
} as const;

function writeEvent(response: NodeJS.WritableStream, type: string, data: object): void {
	response.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
}

function publicProviderError(error: unknown): { code: string; message: string; retryable: boolean } {
	if (error instanceof ProviderError) {
		return { code: error.code, message: error.message, retryable: error.retryable };
	}
	return {
		code: 'provider_error',
		message: 'The model provider failed while generating a response.',
		retryable: false,
	};
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
	const app = Fastify({ logger: options.logger ?? false });

	app.get('/health', {
		schema: {
			response: {
				200: {
					type: 'object',
					additionalProperties: false,
					required: ['status'],
					properties: { status: { const: 'ok' } },
				},
			},
		},
	}, async () => ({ status: 'ok' }));

	app.get('/v1/models', {
		schema: {
			response: {
				200: {
					type: 'object',
					additionalProperties: false,
					required: ['data'],
					properties: {
						data: {
							type: 'array',
							items: {
								type: 'object',
								additionalProperties: false,
								required: ['id', 'provider', 'streaming'],
								properties: {
									id: { type: 'string' },
									provider: { type: 'string' },
									streaming: { type: 'boolean' },
								},
							},
						},
					},
				},
			},
		},
	}, async () => ({
		data: [{ id: options.provider.modelId, provider: options.provider.name, streaming: true }],
	}));

	app.post<{ Body: ChatBody }>('/v1/chat/stream', {
		schema: {
			headers: headersSchema,
			body: {
				type: 'object',
				additionalProperties: false,
				required: ['messages'],
				properties: {
					model: { type: 'string', enum: [options.provider.modelId] },
					messages: {
						type: 'array',
						minItems: 1,
						maxItems: 100,
						items: {
							type: 'object',
							additionalProperties: false,
							required: ['role', 'content'],
							properties: {
								role: { type: 'string', enum: ['system', 'user', 'assistant'] },
								content: { type: 'string', minLength: 1, maxLength: 100_000 },
							},
						},
					},
					temperature: { type: 'number', minimum: 0, maximum: 2 },
					maxTokens: { type: 'integer', minimum: 1, maximum: 128_000 },
				},
			},
		},
	}, async (request, reply) => {
		const devUserHeader = request.headers['x-adro-dev-user'];
		if (options.nodeEnv !== 'development') {
			if (devUserHeader !== undefined) {
				return reply.code(400).send({
					error: 'X-Adro-Dev-User is only accepted when NODE_ENV=development.',
				});
			}
			return reply.code(401).send({ error: 'Authentication is required.' });
		}
		if (typeof devUserHeader !== 'string') {
			return reply.code(401).send({ error: 'X-Adro-Dev-User is required in development.' });
		}

		const userId = await options.usageStore.resolveDevelopmentUser(devUserHeader);
		if (!userId) {
			return reply.code(401).send({ error: 'Unknown development user.' });
		}

		const requestId = randomUUID();
		const startedAt = new Date();
		const model = request.body.model ?? options.provider.modelId;
		const controller = new AbortController();
		let responseFinished = false;
		const cancel = (): void => {
			if (!responseFinished) {
				controller.abort();
			}
		};
		request.raw.once('aborted', cancel);
		reply.raw.once('close', cancel);

		reply.hijack();
		reply.raw.writeHead(200, {
			'content-type': 'text/event-stream; charset=utf-8',
			'cache-control': 'no-cache, no-transform',
			connection: 'keep-alive',
			'x-accel-buffering': 'no',
			'x-request-id': requestId,
		});
		writeEvent(reply.raw, 'metadata', {
			requestId,
			model,
			provider: options.provider.name,
		});

		let providerRequestId: string | undefined;
		let usage: TokenUsage | undefined;
		let status: UsageStatus = 'completed';
		let errorCode: string | undefined;

		try {
			const stream = await options.provider.stream({
				model,
				messages: request.body.messages,
				...(request.body.temperature === undefined ? {} : { temperature: request.body.temperature }),
				...(request.body.maxTokens === undefined ? {} : { maxTokens: request.body.maxTokens }),
			}, controller.signal);
			providerRequestId = stream.providerRequestId;

			for await (const event of stream.events) {
				if (controller.signal.aborted) {
					throw controller.signal.reason;
				}
				if (event.type === 'delta') {
					writeEvent(reply.raw, 'delta', { text: event.text });
				} else {
					usage = event.usage;
					writeEvent(reply.raw, 'usage', event.usage);
				}
			}
			writeEvent(reply.raw, 'done', { status: 'completed' });
		} catch (error) {
			if (controller.signal.aborted) {
				status = 'cancelled';
				errorCode = 'client_cancelled';
			} else {
				status = 'error';
				const publicError = publicProviderError(error);
				errorCode = publicError.code;
				writeEvent(reply.raw, 'error', publicError);
				writeEvent(reply.raw, 'done', { status: 'error' });
			}
		} finally {
			responseFinished = true;
			request.raw.off('aborted', cancel);
			reply.raw.off('close', cancel);
			if (!reply.raw.destroyed) {
				reply.raw.end();
			}
			try {
				await options.usageStore.append({
					requestId,
					...(providerRequestId ? { providerRequestId } : {}),
					userId,
					provider: options.provider.name,
					model,
					...(usage ? { usage } : {}),
					status,
					...(errorCode ? { errorCode } : {}),
					startedAt,
					completedAt: new Date(),
				});
			} catch (error) {
				request.log.error({ error, requestId }, 'Failed to persist AI usage event');
			}
		}
	});

	return app;
}
