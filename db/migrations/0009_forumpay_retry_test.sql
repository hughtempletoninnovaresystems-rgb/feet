-- Opt-in failure fixture, confined to explicitly armed sandbox orders.
CREATE TABLE IF NOT EXISTS forumpay_sandbox_retry_tests (
  order_id uuid PRIMARY KEY REFERENCES forumpay_sandbox_orders(id),
  failures_remaining integer NOT NULL DEFAULT 1 CHECK (failures_remaining BETWEEN 0 AND 1),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 minutes'
);
CREATE TABLE IF NOT EXISTS forumpay_sandbox_retry_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES forumpay_sandbox_retry_tests(order_id),
  event_id text NOT NULL,
  response_status integer NOT NULL CHECK (response_status IN (200,503)),
  received_at timestamptz NOT NULL DEFAULT now()
);
