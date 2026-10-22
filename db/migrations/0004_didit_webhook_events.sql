-- Store minimal, durable Didit webhook receipts for event-id idempotency.
-- Verification payloads can contain sensitive identity data, so they are not persisted.

CREATE TABLE IF NOT EXISTS didit_webhook_events (
  event_id text PRIMARY KEY CHECK (length(event_id) BETWEEN 1 AND 128),
  webhook_type text NOT NULL CHECK (length(webhook_type) BETWEEN 1 AND 100),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS didit_webhook_events_received_idx
  ON didit_webhook_events(received_at);
