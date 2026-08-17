import type { Pool } from 'pg';
import type { TokenUsage } from './provider.js';

export type UsageStatus = 'completed' | 'error' | 'cancelled';

export interface UsageEvent {
	requestId: string;
	providerRequestId?: string;
	userId: string;
	provider: string;
	model: string;
	usage?: TokenUsage;
	status: UsageStatus;
	errorCode?: string;
	startedAt: Date;
	completedAt: Date;
}

export interface UsageStore {
	resolveDevelopmentUser(subject: string): Promise<string | undefined>;
	append(event: UsageEvent): Promise<void>;
}

export class PostgresUsageStore implements UsageStore {
	public constructor(private readonly pool: Pool) {}

	public async resolveDevelopmentUser(subject: string): Promise<string | undefined> {
		const result = await this.pool.query<{ id: string }>(
			'SELECT id FROM users WHERE external_subject = $1 AND is_development = TRUE',
			[subject],
		);
		return result.rows[0]?.id;
	}

	public async append(event: UsageEvent): Promise<void> {
		await this.pool.query(
			`INSERT INTO ai_usage_events (
				request_id, provider_request_id, user_id, provider, model,
				input_tokens, output_tokens, total_tokens, status, error_code,
				started_at, completed_at
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
			[
				event.requestId,
				event.providerRequestId ?? null,
				event.userId,
				event.provider,
				event.model,
				event.usage?.inputTokens ?? null,
				event.usage?.outputTokens ?? null,
				event.usage?.totalTokens ?? null,
				event.status,
				event.errorCode ?? null,
				event.startedAt,
				event.completedAt,
			],
		);
	}
}
