# Adro API

Standalone Fastify service for the Adro AI vertical slice.

## Local setup

1. Copy `.env.example` to `.env`.
2. Leave `ADRO_MODEL_PROVIDER=fake` for local development, or set it to
   `openai-compatible` and fill in `ADRO_MODEL_BASE_URL`, `ADRO_MODEL_API_KEY`,
   and `ADRO_MODEL_ID`. The base URL must include the `/v1` prefix.
3. Run `docker compose up -d`.
4. Run `npm run migrate`.
5. Run `npm run dev`.

In development, chat requests must include `X-Adro-Dev-User: development`. The
header is rejected in every other environment; production authentication is
intentionally not invented by this slice.

## Streaming protocol

`POST /v1/chat/stream` accepts JSON with `messages` and optional `model`,
`temperature`, and `maxTokens`. It responds as `text/event-stream`.

- `metadata`: local `requestId`, selected `model`, and `provider`; always first.
- `delta`: a generated text fragment.
- `usage`: input, output, and total token counts when supplied by the provider.
- `error`: stable code, safe message, and retryability after streaming starts.
- `done`: terminal `completed` or `error` status; not writable after disconnect.

Every finished, failed, or cancelled request appends one row to
`ai_usage_events`. The database rejects updates and deletes on that table.
