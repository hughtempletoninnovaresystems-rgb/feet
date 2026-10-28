CREATE TABLE IF NOT EXISTS forumpay_sandbox_creator_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES users(id),
  amount_pence integer NOT NULL CHECK (amount_pence > 0),
  reference text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER forumpay_sandbox_earnings_immutable BEFORE UPDATE OR DELETE
  ON forumpay_sandbox_creator_earnings FOR EACH ROW EXECUTE FUNCTION prevent_token_ledger_mutation();
CREATE TABLE IF NOT EXISTS forumpay_sandbox_payouts (
  id uuid PRIMARY KEY,
  creator_id uuid NOT NULL REFERENCES users(id),
  request_key uuid NOT NULL,
  amount_pence integer NOT NULL CHECK (amount_pence >= 100 AND amount_pence <= 100000),
  address text NOT NULL CHECK (address ~ '^btc-[a-f0-9]{32}$'),
  state text NOT NULL DEFAULT 'creating' CHECK (state IN ('creating','pending_confirmation','confirming','scheduled','paid','cancelling','cancelled','review')),
  provider_id text UNIQUE,
  crypto_amount text,
  txid text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(creator_id,request_key)
);
CREATE OR REPLACE FUNCTION reserve_forumpay_sandbox_payout(
  p_id uuid,p_creator uuid,p_key uuid,p_amount integer,p_address text
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_existing forumpay_sandbox_payouts%ROWTYPE; v_available bigint;
BEGIN
  PERFORM 1 FROM users WHERE id=p_creator AND role='model' AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ineligible creator'; END IF;
  SELECT * INTO v_existing FROM forumpay_sandbox_payouts WHERE creator_id=p_creator AND request_key=p_key;
  IF FOUND THEN
    IF v_existing.amount_pence <> p_amount OR v_existing.address <> p_address THEN RAISE EXCEPTION 'Idempotency conflict'; END IF;
    RETURN v_existing.id;
  END IF;
  SELECT COALESCE((SELECT sum(amount_pence) FROM forumpay_sandbox_creator_earnings WHERE creator_id=p_creator),0)
    - COALESCE((SELECT sum(amount_pence) FROM forumpay_sandbox_payouts WHERE creator_id=p_creator AND state <> 'cancelled'),0) INTO v_available;
  IF p_amount > v_available THEN RAISE EXCEPTION 'Insufficient test earnings'; END IF;
  INSERT INTO forumpay_sandbox_payouts(id,creator_id,request_key,amount_pence,address)
    VALUES(p_id,p_creator,p_key,p_amount,p_address);
  RETURN p_id;
END;
$$;
REVOKE ALL ON FUNCTION reserve_forumpay_sandbox_payout(uuid,uuid,uuid,integer,text) FROM PUBLIC;
