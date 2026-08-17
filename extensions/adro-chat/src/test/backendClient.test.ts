/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Adro. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { createServer, IncomingMessage } from 'http';
import { AddressInfo } from 'net';
import { getBackendModels, streamBackendResponse } from '../backendClient';

async function requestBody(request: IncomingMessage): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of request) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return Buffer.concat(chunks).toString('utf8');
}

suite('Adro backend client', () => {
	test('uses model and stream endpoints with the development header', async () => {
		const received: Array<{ path: string; developmentUser?: string; body?: object }> = [];
		const server = createServer(async (request, response) => {
			if (request.url === '/v1/models') {
				received.push({ path: request.url });
				response.writeHead(200, { 'content-type': 'application/json' });
				response.end(JSON.stringify({
					data: [{ id: 'configured-model', provider: 'test-provider', streaming: true }],
				}));
				return;
			}
			if (request.url === '/v1/chat/stream') {
				received.push({
					path: request.url,
					developmentUser: request.headers['x-adro-dev-user'] as string | undefined,
					body: JSON.parse(await requestBody(request)) as object,
				});
				response.writeHead(200, { 'content-type': 'text/event-stream' });
				response.end([
					'event: metadata\ndata: {"model":"configured-model"}\n\n',
					'event: delta\ndata: {"text":"Hello"}\n\n',
					'event: usage\ndata: {"inputTokens":1,"outputTokens":1,"totalTokens":2}\n\n',
					'event: done\ndata: {"status":"completed"}\n\n',
				].join(''));
				return;
			}
			response.writeHead(404).end();
		});

		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
		const address = server.address() as AddressInfo;
		const baseUrl = `http://127.0.0.1:${address.port}/`;
		const controller = new AbortController();

		try {
			const models = await getBackendModels(baseUrl, controller.signal);
			const events: string[] = [];
			await streamBackendResponse(
				baseUrl,
				'development-user',
				{ model: models[0].id, messages: [{ role: 'user', content: 'Hello' }] },
				controller.signal,
				event => events.push(event.type)
			);

			assert.deepStrictEqual({
				models,
				received,
				events,
			}, {
				models: [{ id: 'configured-model', provider: 'test-provider', streaming: true }],
				received: [
					{ path: '/v1/models' },
					{
						path: '/v1/chat/stream',
						developmentUser: 'development-user',
						body: {
							model: 'configured-model',
							messages: [{ role: 'user', content: 'Hello' }],
						},
					},
				],
				events: ['metadata', 'delta', 'usage', 'done'],
			});
		} finally {
			await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
		}
	});

	test('rejects malformed model responses', async () => {
		const server = createServer((_request, response) => {
			response.writeHead(200, { 'content-type': 'application/json' });
			response.end(JSON.stringify({ data: [{ id: 'missing-fields' }] }));
		});
		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
		const address = server.address() as AddressInfo;

		try {
			await assert.rejects(
				getBackendModels(`http://127.0.0.1:${address.port}`, new AbortController().signal),
				/invalid model entry/
			);
		} finally {
			await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
		}
	});

	test('rejects streams that end without a done event', async () => {
		const server = createServer((_request, response) => {
			response.writeHead(200, { 'content-type': 'text/event-stream' });
			response.end('event: delta\ndata: {"text":"Hello"}\n\n');
		});
		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
		const address = server.address() as AddressInfo;

		try {
			await assert.rejects(
				streamBackendResponse(
					`http://127.0.0.1:${address.port}`,
					'development',
					{ model: 'configured-model', messages: [{ role: 'user', content: 'Hello' }] },
					new AbortController().signal,
					() => undefined
				),
				/done event/
			);
		} finally {
			await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
		}
	});
});
