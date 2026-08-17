/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Adro. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BackendMetadata, BackendStreamEvent, BackendUsage } from './protocol';

export interface ServerSentEvent {
	event: string;
	data: string;
}

export class ServerSentEventParser {
	private buffer = '';
	private eventName = '';
	private data: string[] = [];

	push(fragment: string): ServerSentEvent[] {
		this.buffer += fragment;
		const events: ServerSentEvent[] = [];
		let newline = this.buffer.indexOf('\n');

		while (newline >= 0) {
			let line = this.buffer.slice(0, newline);
			this.buffer = this.buffer.slice(newline + 1);
			if (line.endsWith('\r')) {
				line = line.slice(0, -1);
			}
			this.processLine(line, events);
			newline = this.buffer.indexOf('\n');
		}

		return events;
	}

	finish(): ServerSentEvent[] {
		const events: ServerSentEvent[] = [];
		if (this.buffer.length > 0) {
			let line = this.buffer;
			if (line.endsWith('\r')) {
				line = line.slice(0, -1);
			}
			this.processLine(line, events);
			this.buffer = '';
		}
		this.dispatch(events);
		return events;
	}

	private processLine(line: string, events: ServerSentEvent[]): void {
		if (line.length === 0) {
			this.dispatch(events);
			return;
		}
		if (line.startsWith(':')) {
			return;
		}

		const colon = line.indexOf(':');
		const field = colon < 0 ? line : line.slice(0, colon);
		let value = colon < 0 ? '' : line.slice(colon + 1);
		if (value.startsWith(' ')) {
			value = value.slice(1);
		}

		if (field === 'event') {
			this.eventName = value;
		} else if (field === 'data') {
			this.data.push(value);
		}
	}

	private dispatch(events: ServerSentEvent[]): void {
		if (this.data.length > 0) {
			events.push({
				event: this.eventName || 'message',
				data: this.data.join('\n'),
			});
		}
		this.eventName = '';
		this.data = [];
	}
}

function parseObject(data: string): BackendMetadata {
	const parsed: unknown = JSON.parse(data);
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		throw new Error('Expected an object in the Adro stream.');
	}
	return parsed as BackendMetadata;
}

function stringProperty(value: BackendMetadata, ...names: string[]): string | undefined {
	for (const name of names) {
		if (typeof value[name] === 'string') {
			return value[name];
		}
	}
	return undefined;
}

export function decodeBackendEvent(event: ServerSentEvent): BackendStreamEvent {
	if (event.event === 'done' || event.data === '[DONE]') {
		return { type: 'done' };
	}
	if (event.event === 'delta') {
		if (!event.data.startsWith('{')) {
			return { type: 'delta', value: event.data };
		}
		const value = parseObject(event.data);
		return { type: 'delta', value: stringProperty(value, 'delta', 'content', 'text') ?? '' };
	}
	if (event.event === 'metadata') {
		return { type: 'metadata', value: parseObject(event.data) };
	}
	if (event.event === 'usage') {
		return { type: 'usage', value: parseObject(event.data) as BackendUsage };
	}
	if (event.event === 'error') {
		if (!event.data.startsWith('{')) {
			return { type: 'error', value: event.data };
		}
		const value = parseObject(event.data);
		return { type: 'error', value: stringProperty(value, 'message', 'error') ?? 'Adro backend error' };
	}

	const value = parseObject(event.data);
	const type = stringProperty(value, 'type', 'event');
	if (!type) {
		throw new Error(`Unknown Adro stream event: ${event.event}`);
	}
	return decodeBackendEvent({
		event: type,
		data: type === 'delta' ? JSON.stringify(value) : event.data,
	});
}
