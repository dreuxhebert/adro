/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Adro. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { createBackendRequest } from '../request';

suite('Adro request mapping', () => {
	test('maps roles and joins text message parts', () => {
		const request = createBackendRequest('configured-model', [
			{
				role: 1,
				content: [{ value: 'first ' }, { value: 'question' }],
			},
			{
				role: 2,
				content: [{ value: 'answer' }, { ignored: true }],
			},
		]);

		assert.deepStrictEqual(request, {
			model: 'configured-model',
			messages: [
				{ role: 'user', content: 'first question' },
				{ role: 'assistant', content: 'answer' },
			],
		});
	});
});
