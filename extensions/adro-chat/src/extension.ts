/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Adro. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getBackendModels, streamBackendResponse } from './backendClient';
import { createBackendRequest, SourceMessage } from './request';

const vendor = 'adro';

function configurationValue(name: 'backendUrl' | 'developmentUserId'): string {
	const value = vscode.workspace.getConfiguration('adro.chat').get<string>(name)?.trim();
	if (!value) {
		throw new Error(vscode.l10n.t('Configure {0} before using Adro.', `adro.chat.${name}`));
	}
	return value;
}

class AdroLanguageModelProvider implements vscode.LanguageModelChatProvider {
	async provideLanguageModelChatInformation(
		_options: vscode.PrepareLanguageModelChatModelOptions,
		token: vscode.CancellationToken
	): Promise<vscode.LanguageModelChatInformation[]> {
		const controller = new AbortController();
		const cancellation = token.onCancellationRequested(() => controller.abort());
		if (token.isCancellationRequested) {
			controller.abort();
		}

		try {
			const models = await getBackendModels(configurationValue('backendUrl'), controller.signal);
			return models
				.filter(model => model.streaming)
				.map(model => ({
					id: model.id,
					name: model.id,
					family: 'adro',
					version: '1',
					detail: model.provider,
					maxInputTokens: 128_000,
					maxOutputTokens: 128_000,
					capabilities: {},
				}));
		} catch {
			// Allow Chat to start when the local backend is still booting.
			return [{
				id: 'adro-fake',
				name: 'Adro (offline)',
				family: 'adro',
				version: '1',
				detail: 'local',
				maxInputTokens: 128_000,
				maxOutputTokens: 128_000,
				capabilities: {},
			}];
		} finally {
			cancellation.dispose();
		}
	}

	async provideLanguageModelChatResponse(
		model: vscode.LanguageModelChatInformation,
		messages: readonly vscode.LanguageModelChatRequestMessage[],
		_options: vscode.ProvideLanguageModelChatResponseOptions,
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
		token: vscode.CancellationToken
	): Promise<void> {
		const backendUrl = configurationValue('backendUrl');
		const developmentUserId = configurationValue('developmentUserId');

		const controller = new AbortController();
		const cancellation = token.onCancellationRequested(() => controller.abort());
		if (token.isCancellationRequested) {
			controller.abort();
		}

		try {
			await streamBackendResponse(
				backendUrl,
				developmentUserId,
				createBackendRequest(model.id, messages as readonly SourceMessage[]),
				controller.signal,
				event => {
					if (event.type === 'delta' && event.value.length > 0) {
						progress.report(new vscode.LanguageModelTextPart(event.value));
					}
				}
			);
		} catch (error) {
			if (token.isCancellationRequested && error instanceof Error && error.name === 'AbortError') {
				return;
			}
			throw error;
		} finally {
			cancellation.dispose();
		}
	}

	async provideTokenCount(
		_model: vscode.LanguageModelChatInformation,
		text: string | vscode.LanguageModelChatRequestMessage
	): Promise<number> {
		const value = typeof text === 'string'
			? text
			: (text as SourceMessage).content
				.map(part => typeof part === 'object' && part !== null && 'value' in part && typeof part.value === 'string' ? part.value : '')
				.join('');
		return Math.max(1, Math.ceil(value.length / 4));
	}
}

function historyMessages(context: vscode.ChatContext): vscode.LanguageModelChatMessage[] {
	const messages: vscode.LanguageModelChatMessage[] = [];
	for (const turn of context.history) {
		if (turn instanceof vscode.ChatRequestTurn) {
			messages.push(vscode.LanguageModelChatMessage.User(turn.prompt));
		} else if (turn instanceof vscode.ChatResponseTurn) {
			const response = turn.response
				.filter(part => part instanceof vscode.ChatResponseMarkdownPart)
				.map(part => part.value.value)
				.join('');
			if (response.length > 0) {
				messages.push(vscode.LanguageModelChatMessage.Assistant(response));
			}
		}
	}
	return messages;
}

export function activate(context: vscode.ExtensionContext): void {
	context.subscriptions.push(vscode.lm.registerLanguageModelChatProvider(vendor, new AdroLanguageModelProvider()));

	const participant = vscode.chat.createChatParticipant('adro.chat', async (request, chatContext, stream, token) => {
		const models = await vscode.lm.selectChatModels({ vendor });
		const model = models[0];
		if (!model) {
			throw new Error(vscode.l10n.t('No Adro language model is available.'));
		}

		const messages = historyMessages(chatContext);
		messages.push(vscode.LanguageModelChatMessage.User(request.prompt));
		const response = await model.sendRequest(messages, {}, token);
		for await (const fragment of response.text) {
			stream.markdown(fragment);
		}
	});
	context.subscriptions.push(participant);
}
