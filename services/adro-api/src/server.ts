import 'dotenv/config';
import pg from 'pg';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { FakeModelProvider } from './fake-provider.js';
import { OpenAiCompatibleProvider } from './openai-compatible-provider.js';
import type { ModelProvider } from './provider.js';
import { PostgresUsageStore } from './usage-store.js';

const config = loadConfig();
const pool = new pg.Pool({ connectionString: config.databaseUrl });
const provider: ModelProvider = config.modelProvider === 'fake'
	? new FakeModelProvider(config.modelId)
	: new OpenAiCompatibleProvider({
		baseUrl: config.modelBaseUrl,
		apiKey: config.modelApiKey,
		modelId: config.modelId,
	});
const app = buildApp({
	nodeEnv: config.nodeEnv,
	provider,
	usageStore: new PostgresUsageStore(pool),
	logger: true,
});

app.addHook('onClose', async () => {
	await pool.end();
});

const shutdown = async (signal: string): Promise<void> => {
	app.log.info({ signal }, 'Shutting down');
	await app.close();
};

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: config.host, port: config.port });
