/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Adro. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type BackendRole = 'user' | 'assistant';

export interface BackendMessage {
	role: BackendRole;
	content: string;
}

export interface BackendChatRequest {
	model: string;
	messages: BackendMessage[];
}

export interface BackendModel {
	id: string;
	provider: string;
	streaming: boolean;
}

export interface BackendMetadata {
	readonly [key: string]: unknown;
}

export interface BackendUsage {
	readonly [key: string]: unknown;
}

export type BackendStreamEvent =
	| { type: 'metadata'; value: BackendMetadata }
	| { type: 'delta'; value: string }
	| { type: 'usage'; value: BackendUsage }
	| { type: 'error'; value: string }
	| { type: 'done' };
