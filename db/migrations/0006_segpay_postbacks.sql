-- Record a minimal, idempotent Segpay transaction-postback audit trail.
-- This does not grant tokens, media access, or creator earnings.

CREATE TABLE IF NOT EXISTS segpay_postback_events (
  provider text NOT NULL DEFAULT 'segpay' CHECK (provider = 'segpay'),
  event_id text NOT NULL,
  transaction_id text NOT NULL,
  purchase_id text NOT NULL,
  related_transaction_id text,
  transaction_type text NOT NULL,
  action text NOT NULL,
  stage text NOT NULL,
  approved boolean NOT NULL,
  amount numeric(12, 2) NOT NULL CHECK (amount >= 0),
  currency char(3) NOT NULL,
  package_id text,
  reference_1 text,
  PRIMARY KEY (provider, event_id),
  FOREIGN KEY (provider, event_id)
    REFERENCES payment_provider_events(provider, event_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS segpay_postback_purchase_idx
  ON segpay_postback_events(purchase_id, transaction_id);
CREATE INDEX IF NOT EXISTS segpay_postback_related_transaction_idx
  ON segpay_postback_events(related_transaction_id)
  WHERE related_transaction_id IS NOT NULL;
