import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import 'dotenv/config';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
	throw new Error('DATABASE_URL is required');
}

const pool = new pg.Pool({ connectionString: databaseUrl });

try {
	await pool.query(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			name TEXT PRIMARY KEY,
			checksum TEXT NOT NULL,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`);

	const directory = resolve(process.cwd(), 'migrations');
	const migrations = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort();
	for (const name of migrations) {
		const sql = await readFile(resolve(directory, name), 'utf8');
		const checksum = createHash('sha256').update(sql).digest('hex');
		const existing = await pool.query<{ checksum: string }>(
			'SELECT checksum FROM schema_migrations WHERE name = $1',
			[name],
		);
		if (existing.rows[0]) {
			if (existing.rows[0].checksum !== checksum) {
				throw new Error(`Applied migration ${name} has changed`);
			}
			continue;
		}

		const client = await pool.connect();
		try {
			await client.query('BEGIN');
			await client.query(sql);
			await client.query(
				'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
				[name, checksum],
			);
			await client.query('COMMIT');
			console.log(`Applied ${name}`);
		} catch (error) {
			await client.query('ROLLBACK');
			throw error;
		} finally {
			client.release();
		}
	}
} finally {
	await pool.end();
}
