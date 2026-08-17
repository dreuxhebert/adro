/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Adro. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BackendChatRequest, BackendModel, BackendStreamEvent } from './protocol';
import { decodeBackendEvent, ServerSentEventParser } from './sse';

type FetchImplementation = typeof fetch;

export function backendEndpoint(baseUrl: string, path: string): string {
	return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

export function parseModelsResponse(value: unknown): BackendModel[] {
	if (typeof value !== 'object' || value === null || !('data' in value) || !Array.isArray(value.data)) {
		throw new Error('Adro backend returned an invalid models response.');
	}

	return value.data.map(model => {
		if (
			typeof model !== 'object'
			|| model === null
			|| !('id' in model)
			|| typeof model.id !== 'string'
			|| !('provider' in model)
			|| typeof model.provider !== 'string'
			|| !('streaming' in model)
			|| typeof model.streaming !== 'boolean'
		) {
			throw new Error('Adro backend returned an invalid model entry.');
		}
		return {
			id: model.id,
			provider: model.provider,
			streaming: model.streaming,
		};
	});
}

export async function getBackendModels(
	baseUrl: string,
	signal: AbortSignal,
	fetchImplementation: FetchImplementation = fetch
): Promise<BackendModel[]> {
	const response = await fetchImplementation(backendEndpoint(baseUrl, '/v1/models'), {
		method: 'GET',
		headers: { Accept: 'application/json' },
		signal,
	});
	if (!response.ok) {
		const detail = await response.text();
		throw new Error(`Adro backend returned ${response.status}: ${detail || response.statusText}`);
	}
	return parseModelsResponse(await response.json());
}

export async function streamBackendResponse(
	baseUrl: string,
	developmentUserId: string,
	request: BackendChatRequest,
	signal: AbortSignal,
	onEvent: (event: BackendStreamEvent) => void,
	fetchImplementation: FetchImplementation = fetch
): Promise<void> {
	const response = await fetchImplementation(backendEndpoint(baseUrl, '/v1/chat/stream'), {
		method: 'POST',
		headers: {
			Accept: 'text/event-stream',
			'Content-Type': 'application/json',
			'X-Adro-Dev-User': developmentUserId,
		},
		body: JSON.stringify(request),
		signal,
	});

	if (!response.ok) {
		const detail = await response.text();
		throw new Error(`Adro backend returned ${response.status}: ${detail || response.statusText}`);
	}
	if (!response.body) {
		throw new Error('Adro backend returned an empty response body.');
	}

	const decoder = new TextDecoder();
	const parser = new ServerSentEventParser();
	let done = false;

	const report = (fragment: string): void => {
		for (const rawEvent of parser.push(fragment)) {
			const event = decodeBackendEvent(rawEvent);
			onEvent(event);
			if (event.type === 'error') {
				throw new Error(event.value);
			}
			if (event.type === 'done') {
				done = true;
				break;
			}
		}
	};

	for await (const chunk of response.body) {
		report(decoder.decode(chunk, { stream: true }));
		if (done) {
			return;
		}
	}

	report(decoder.decode());
	for (const rawEvent of parser.finish()) {
		const event = decodeBackendEvent(rawEvent);
		onEvent(event);
		if (event.type === 'error') {
			throw new Error(event.value);
		}
		if (event.type === 'done') {
			return;
		}
	}

	throw new Error('Adro backend closed the stream before sending a done event.');
}
