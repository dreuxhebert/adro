CREATE TABLE users (
	id UUID PRIMARY KEY,
	external_subject TEXT NOT NULL UNIQUE,
	is_development BOOLEAN NOT NULL DEFAULT FALSE,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO users (id, external_subject, is_development)
VALUES ('00000000-0000-4000-8000-000000000001', 'development', TRUE);

CREATE TABLE ai_usage_events (
	id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	request_id UUID NOT NULL UNIQUE,
	provider_request_id TEXT,
	user_id UUID NOT NULL REFERENCES users(id),
	provider TEXT NOT NULL,
	model TEXT NOT NULL,
	input_tokens INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0),
	output_tokens INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
	total_tokens INTEGER CHECK (total_tokens IS NULL OR total_tokens >= 0),
	status TEXT NOT NULL CHECK (status IN ('completed', 'error', 'cancelled')),
	error_code TEXT,
	started_at TIMESTAMPTZ NOT NULL,
	completed_at TIMESTAMPTZ NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CHECK (completed_at >= started_at),
	CHECK (
		(input_tokens IS NULL AND output_tokens IS NULL AND total_tokens IS NULL)
		OR (input_tokens IS NOT NULL AND output_tokens IS NOT NULL AND total_tokens IS NOT NULL)
	)
);

CREATE INDEX ai_usage_events_user_created_idx
	ON ai_usage_events (user_id, created_at DESC);

CREATE FUNCTION reject_ai_usage_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'ai_usage_events is append-only';
END;
$$;

CREATE TRIGGER ai_usage_events_no_update
BEFORE UPDATE ON ai_usage_events
FOR EACH ROW EXECUTE FUNCTION reject_ai_usage_event_mutation();

CREATE TRIGGER ai_usage_events_no_delete
BEFORE DELETE ON ai_usage_events
FOR EACH ROW EXECUTE FUNCTION reject_ai_usage_event_mutation();
