/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Adro. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { decodeBackendEvent, ServerSentEvent, ServerSentEventParser } from '../sse';

suite('Adro SSE parser', () => {
	test('parses fragmented events and multiline data', () => {
		const parser = new ServerSentEventParser();
		const events: ServerSentEvent[] = [];
		const fragments = [
			'event: met',
			'adata\r\ndata: {"requestId"',
			':"123"}\r\n\r\nevent: delta\n',
			'data: Hel',
			'lo\n\nevent: usage\ndata: {"input":2,\n',
			'data: "output":1}\n\nevent: done\ndata: {}\n\n',
		];

		for (const fragment of fragments) {
			events.push(...parser.push(fragment));
		}
		events.push(...parser.finish());

		assert.deepStrictEqual(events.map(decodeBackendEvent), [
			{ type: 'metadata', value: { requestId: '123' } },
			{ type: 'delta', value: 'Hello' },
			{ type: 'usage', value: { input: 2, output: 1 } },
			{ type: 'done' },
		]);
	});

	test('parses event type carried in JSON data', () => {
		const parser = new ServerSentEventParser();
		const events = [
			...parser.push('data: {"type":"delta","delta":"frag'),
			...parser.push('ment"}\n\ndata: [DONE]\n\n'),
		];

		assert.deepStrictEqual(events.map(decodeBackendEvent), [
			{ type: 'delta', value: 'fragment' },
			{ type: 'done' },
		]);
	});
});
