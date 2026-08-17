import { describe, expect, test } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
	test('loads a fake provider without model credentials', () => {
		const previous = { ...process.env };
		process.env.NODE_ENV = 'development';
		process.env.DATABASE_URL = 'postgresql://adro:adro@127.0.0.1:5433/adro';
		process.env.ADRO_MODEL_PROVIDER = 'fake';
		delete process.env.ADRO_MODEL_BASE_URL;
		delete process.env.ADRO_MODEL_API_KEY;
		delete process.env.ADRO_MODEL_ID;

		try {
			expect(loadConfig()).toMatchObject({
				nodeEnv: 'development',
				modelProvider: 'fake',
				modelId: 'adro-fake',
				modelApiKey: 'fake',
			});
		} finally {
			for (const key of Object.keys(process.env)) {
				if (!(key in previous)) {
					delete process.env[key];
				}
			}
			Object.assign(process.env, previous);
		}
	});

	test('requires model credentials for openai-compatible providers', () => {
		const previous = { ...process.env };
		process.env.NODE_ENV = 'development';
		process.env.DATABASE_URL = 'postgresql://adro:adro@127.0.0.1:5433/adro';
		process.env.ADRO_MODEL_PROVIDER = 'openai-compatible';
		process.env.ADRO_MODEL_BASE_URL = 'https://api.openai.com/v1';
		delete process.env.ADRO_MODEL_API_KEY;

		try {
			expect(() => loadConfig()).toThrow(/ADRO_MODEL_API_KEY/);
		} finally {
			for (const key of Object.keys(process.env)) {
				if (!(key in previous)) {
					delete process.env[key];
				}
			}
			Object.assign(process.env, previous);
		}
	});
});
