# Adro AI Architecture

Adro reuses the Code OSS chat workbench and adds an Adro-owned provider through a built-in extension. Model credentials and usage records stay in the backend; they are never stored in the editor.

## First Vertical Slice

```text
Chat panel -> Adro default participant -> Adro language model provider
           -> Adro API -> OpenAI-compatible provider
                       -> PostgreSQL usage event
```

Adro is the default Chat participant. GitHub Copilot remains in-tree as a reference implementation and can still be invoked explicitly, but Copilot setup does not own the panel and is not required for ordinary Chat turns.

While `product.json` `defaultChatAgent.chatExtensionId` is `Adro.adro-chat`, Copilot setup agents, GitHub entitlement polling, and Copilot marketplace auto-updates are skipped.

### Editor extension

`extensions/adro-chat`:

- Registers the `adro` language-model vendor.
- Discovers models from `GET /v1/models`.
- Streams chat from `POST /v1/chat/stream`.
- Sends only a development identity header. It never receives the model provider key.

### Backend

`services/adro-api`:

- Proxies one configurable OpenAI-compatible model.
- Streams stable Adro SSE events.
- Accepts `X-Adro-Dev-User` only when `NODE_ENV=development`.
- Appends completed, failed, and cancelled requests to `ai_usage_events`.

Credits, ad rewards, real authentication, tools, and agent sessions are later milestones.

## Local Development

From `services/adro-api`:

1. Run `npm install`.
2. Copy `.env.example` to `.env`.
3. Keep `ADRO_MODEL_PROVIDER=fake` for local development, or set `openai-compatible` plus model credentials.
4. Run `docker compose up -d`.
5. Run `npm run migrate`.
6. Run `npm run dev`.

The backend listens on `http://127.0.0.1:4310` by default. The seeded development identity is `development`, matching the extension setting `adro.chat.developmentUserId`.

Compile and launch Adro from the repository root:

```powershell
npm run compile
.\scripts\code.bat
```

Open Chat and send a request. The default participant is Adro, so `@adro` is optional. The backend must be running before the Adro model can be discovered.

## Validation

```powershell
npm --prefix services/adro-api run typecheck
npm --prefix services/adro-api test
npm --prefix services/adro-api run smoke
npm --prefix extensions/adro-chat run compile
npm --prefix extensions/adro-chat test
```

PostgreSQL migration and persistence checks require Docker or another PostgreSQL 17 instance configured through `DATABASE_URL`.

## Promotion to Default

Adro is the default Chat participant. Remaining later milestones:

1. Add real Adro authentication.
2. Add an append-only credit ledger and usage charging.
3. Optionally disable or stop packaging Copilot in Adro distributions.

Internal compatibility identifiers such as `vscode` APIs and existing workbench command/view IDs should not be renamed.
