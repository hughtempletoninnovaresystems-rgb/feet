-- Sandbox orders and credits must never fund production wallets.
CREATE TABLE IF NOT EXISTS forumpay_sandbox_orders (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_key uuid NOT NULL,
  package_id text NOT NULL,
  amount_pence integer NOT NULL CHECK (amount_pence > 0),
  tokens integer NOT NULL CHECK (tokens > 0),
  state text NOT NULL DEFAULT 'creating' CHECK (state IN ('creating','pending','confirmed','cancelled','review')),
  checkout_url text,
  payment_id text UNIQUE,
  currency text,
  address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, request_key)
);
CREATE INDEX IF NOT EXISTS forumpay_sandbox_orders_user_idx ON forumpay_sandbox_orders(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS forumpay_sandbox_credits (
  order_id uuid PRIMARY KEY REFERENCES forumpay_sandbox_orders(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  tokens integer NOT NULL CHECK (tokens > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS forumpay_sandbox_credits_immutable ON forumpay_sandbox_credits;
CREATE TRIGGER forumpay_sandbox_credits_immutable BEFORE UPDATE OR DELETE ON forumpay_sandbox_credits
  FOR EACH ROW EXECUTE FUNCTION prevent_token_ledger_mutation();
CREATE TABLE IF NOT EXISTS forumpay_sandbox_notifications (
  id text PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES forumpay_sandbox_orders(id) ON DELETE RESTRICT,
  payment_id text NOT NULL,
  currency text NOT NULL,
  address text NOT NULL,
  processed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS forumpay_sandbox_inbox_pending_idx ON forumpay_sandbox_notifications(received_at) WHERE processed_at IS NULL;
