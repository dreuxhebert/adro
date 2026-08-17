/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Adro. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BackendChatRequest, BackendMessage } from './protocol';

export interface SourceMessagePart {
	readonly value?: unknown;
}

export interface SourceMessage {
	readonly role: number;
	readonly content: ReadonlyArray<SourceMessagePart | unknown>;
}

function textContent(message: SourceMessage): string {
	return message.content
		.map(part => {
			if (typeof part === 'object' && part !== null && 'value' in part && typeof part.value === 'string') {
				return part.value;
			}
			return '';
		})
		.join('');
}

export function mapMessages(messages: readonly SourceMessage[]): BackendMessage[] {
	return messages.map(message => ({
		role: message.role === 2 ? 'assistant' : 'user',
		content: textContent(message),
	}));
}

export function createBackendRequest(
	model: string,
	messages: readonly SourceMessage[]
): BackendChatRequest {
	return {
		model,
		messages: mapMessages(messages),
	};
}
