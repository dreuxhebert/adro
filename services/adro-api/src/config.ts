export interface AppConfig {
	nodeEnv: 'development' | 'test' | 'production';
	host: string;
	port: number;
	databaseUrl: string;
	modelProvider: 'openai-compatible' | 'fake';
	modelBaseUrl: string;
	modelApiKey: string;
	modelId: string;
}

function required(name: string): string {
	const value = process.env[name]?.trim();
	if (!value) {
		throw new Error(`${name} is required`);
	}
	return value;
}

export function loadConfig(): AppConfig {
	const nodeEnv = process.env.NODE_ENV ?? 'development';
	if (nodeEnv !== 'development' && nodeEnv !== 'test' && nodeEnv !== 'production') {
		throw new Error('NODE_ENV must be development, test, or production');
	}

	const port = Number(process.env.PORT ?? '4310');
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error('PORT must be an integer between 1 and 65535');
	}

	const modelProvider = process.env.ADRO_MODEL_PROVIDER?.trim() || 'openai-compatible';
	if (modelProvider !== 'openai-compatible' && modelProvider !== 'fake') {
		throw new Error('ADRO_MODEL_PROVIDER must be openai-compatible or fake');
	}

	return {
		nodeEnv,
		host: process.env.HOST?.trim() || '127.0.0.1',
		port,
		databaseUrl: required('DATABASE_URL'),
		modelProvider,
		modelBaseUrl: modelProvider === 'fake'
			? (process.env.ADRO_MODEL_BASE_URL?.trim().replace(/\/+$/, '') || 'http://127.0.0.1:0')
			: required('ADRO_MODEL_BASE_URL').replace(/\/+$/, ''),
		modelApiKey: modelProvider === 'fake'
			? (process.env.ADRO_MODEL_API_KEY?.trim() || 'fake')
			: required('ADRO_MODEL_API_KEY'),
		modelId: process.env.ADRO_MODEL_ID?.trim() || (modelProvider === 'fake' ? 'adro-fake' : required('ADRO_MODEL_ID')),
	};
}
