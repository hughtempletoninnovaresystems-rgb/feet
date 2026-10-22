-- My Feet Show starter schema for Neon Postgres.
-- Apply as a migration after reviewing age, privacy, payment, and retention requirements.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  email_verified_at timestamptz,
  password_hash text,
  role text NOT NULL CHECK (role IN ('client', 'model', 'admin')),
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'restricted', 'suspended', 'closed')),
  date_of_birth date,
  age_verified_at timestamptz,
  avatar_asset_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE INDEX users_role_status_idx ON users(role, status) WHERE closed_at IS NULL;

-- Separate role-profile tables keep role-specific data and access paths distinct.
CREATE TABLE client_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  handle text NOT NULL UNIQUE,
  bio text NOT NULL DEFAULT '',
  location_label text,
  discoverable boolean NOT NULL DEFAULT true,
  show_online_status boolean NOT NULL DEFAULT true,
  allow_likes boolean NOT NULL DEFAULT true,
  allow_comments boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE model_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  handle text NOT NULL UNIQUE,
  bio text NOT NULL DEFAULT '',
  location_label text,
  categories text[] NOT NULL DEFAULT '{}',
  call_rate_tokens_per_minute integer NOT NULL DEFAULT 18 CHECK (call_rate_tokens_per_minute > 0),
  default_photo_price_tokens integer NOT NULL DEFAULT 12 CHECK (default_photo_price_tokens > 0),
  default_video_price_tokens integer NOT NULL DEFAULT 24 CHECK (default_video_price_tokens > 0),
  payout_provider_account_id text UNIQUE,
  payout_onboarding_complete boolean NOT NULL DEFAULT false,
  discoverable boolean NOT NULL DEFAULT true,
  show_online_status boolean NOT NULL DEFAULT true,
  allow_likes boolean NOT NULL DEFAULT true,
  allow_comments boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX model_profiles_discoverable_idx ON model_profiles(discoverable) WHERE discoverable = true;

CREATE TABLE auth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('email', 'google', 'facebook')),
  provider_subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_subject),
  UNIQUE(user_id, provider)
);

CREATE TABLE password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX password_reset_user_expiry_idx ON password_reset_tokens(user_id, expires_at);

CREATE TABLE legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_key text NOT NULL,
  document_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip_hash text,
  user_agent_hash text,
  UNIQUE(user_id, document_key, document_version)
);

CREATE TABLE media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_key text NOT NULL UNIQUE,
  media_type text NOT NULL CHECK (media_type IN ('image', 'video', 'avatar')),
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  checksum_sha256 text,
  moderation_status text NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('pending', 'approved', 'rejected', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX media_assets_owner_idx ON media_assets(owner_user_id, created_at DESC);

ALTER TABLE users ADD CONSTRAINT users_avatar_asset_fk FOREIGN KEY (avatar_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL;

CREATE TABLE creator_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_user_id uuid NOT NULL REFERENCES model_profiles(user_id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  media_type text NOT NULL CHECK (media_type IN ('photo_set', 'video')),
  price_tokens bigint NOT NULL CHECK (price_tokens > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'hidden', 'removed')),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX creator_media_discovery_idx ON creator_media(status, published_at DESC) WHERE status = 'published';

CREATE TABLE creator_media_assets (
  creator_media_id uuid NOT NULL REFERENCES creator_media(id) ON DELETE CASCADE,
  media_asset_id uuid NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  preview boolean NOT NULL DEFAULT false,
  PRIMARY KEY (creator_media_id, media_asset_id)
);

CREATE TABLE wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  account_kind text NOT NULL CHECK (account_kind IN ('user', 'platform', 'pending_payout')),
  currency char(3) NOT NULL DEFAULT 'GBP' CHECK (currency = 'GBP'),
  balance_tokens bigint NOT NULL DEFAULT 0 CHECK (balance_tokens >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((account_kind = 'user' AND owner_user_id IS NOT NULL) OR (account_kind <> 'user' AND owner_user_id IS NULL))
);

CREATE TABLE token_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_wallet_id uuid NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  to_wallet_id uuid NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  amount_tokens bigint NOT NULL CHECK (amount_tokens > 0),
  entry_type text NOT NULL CHECK (entry_type IN ('top_up', 'content_purchase', 'call_minute', 'model_earning', 'payout', 'refund', 'adjustment', 'platform_fee')),
  idempotency_key text NOT NULL UNIQUE,
  external_reference text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_wallet_id <> to_wallet_id)
);
CREATE INDEX token_ledger_from_idx ON token_ledger(from_wallet_id, created_at DESC);
CREATE INDEX token_ledger_to_idx ON token_ledger(to_wallet_id, created_at DESC);
CREATE INDEX token_ledger_external_idx ON token_ledger(external_reference) WHERE external_reference IS NOT NULL;

CREATE OR REPLACE FUNCTION prevent_token_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Token ledger entries are immutable';
END;
$$;
CREATE TRIGGER token_ledger_immutable
  BEFORE UPDATE OR DELETE ON token_ledger
  FOR EACH ROW EXECUTE FUNCTION prevent_token_ledger_mutation();

CREATE TABLE content_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_user_id uuid NOT NULL REFERENCES client_profiles(user_id) ON DELETE RESTRICT,
  creator_media_id uuid NOT NULL REFERENCES creator_media(id) ON DELETE RESTRICT,
  model_user_id uuid NOT NULL REFERENCES model_profiles(user_id) ON DELETE RESTRICT,
  price_tokens bigint NOT NULL CHECK (price_tokens > 0),
  ledger_entry_id uuid NOT NULL UNIQUE REFERENCES token_ledger(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(buyer_user_id, creator_media_id)
);
CREATE INDEX content_purchases_buyer_idx ON content_purchases(buyer_user_id, created_at DESC);

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_user_id uuid NOT NULL REFERENCES client_profiles(user_id) ON DELETE CASCADE,
  model_user_id uuid NOT NULL REFERENCES model_profiles(user_id) ON DELETE CASCADE,
  twilio_conversation_sid text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_user_id, model_user_id),
  CHECK (client_user_id <> model_user_id)
);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  body text NOT NULL,
  twilio_message_sid text UNIQUE,
  media_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX messages_conversation_idx ON messages(conversation_id, created_at DESC);

CREATE TABLE broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_user_id uuid NOT NULL REFERENCES model_profiles(user_id) ON DELETE CASCADE,
  title text NOT NULL,
  call_rate_tokens_per_minute integer NOT NULL CHECK (call_rate_tokens_per_minute > 0),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'ended', 'cancelled')),
  scheduled_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  twilio_room_sid text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX broadcasts_discovery_idx ON broadcasts(status, scheduled_at) WHERE status IN ('scheduled', 'live');

CREATE TABLE live_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_user_id uuid NOT NULL REFERENCES client_profiles(user_id) ON DELETE RESTRICT,
  model_user_id uuid NOT NULL REFERENCES model_profiles(user_id) ON DELETE RESTRICT,
  call_rate_tokens_per_minute integer NOT NULL CHECK (call_rate_tokens_per_minute > 0),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'active', 'ended', 'failed', 'cancelled')),
  twilio_room_sid text UNIQUE,
  started_at timestamptz,
  ended_at timestamptz,
  billed_seconds integer NOT NULL DEFAULT 0 CHECK (billed_seconds >= 0),
  charged_tokens bigint NOT NULL DEFAULT 0 CHECK (charged_tokens >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (client_user_id <> model_user_id)
);

CREATE TABLE profile_likes (
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_user_id, target_user_id),
  CHECK (actor_user_id <> target_user_id)
);
CREATE INDEX profile_likes_target_idx ON profile_likes(target_user_id, created_at DESC);

CREATE TABLE profile_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (author_user_id <> target_user_id)
);
CREATE INDEX profile_comments_target_idx ON profile_comments(target_user_id, created_at DESC) WHERE status = 'visible';

CREATE TABLE user_blocks (
  blocker_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_user_id, blocked_user_id),
  CHECK (blocker_user_id <> blocked_user_id)
);

CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  reported_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  target_kind text NOT NULL CHECK (target_kind IN ('profile', 'content', 'message', 'comment', 'broadcast', 'call')),
  target_id uuid,
  reason text NOT NULL,
  details text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'actioned', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

CREATE TABLE payment_provider_events (
  provider text NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_error text,
  PRIMARY KEY (provider, event_id)
);

-- A ledger move and both cached balances commit atomically. Call from a trusted server transaction.
CREATE OR REPLACE FUNCTION move_tokens(
  p_from_wallet uuid,
  p_to_wallet uuid,
  p_amount bigint,
  p_entry_type text,
  p_idempotency_key text,
  p_external_reference text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_from_balance bigint;
  v_entry_id uuid;
BEGIN
  IF p_amount <= 0 OR p_from_wallet = p_to_wallet THEN
    RAISE EXCEPTION 'Invalid token transfer';
  END IF;

  PERFORM 1 FROM wallets WHERE id IN (p_from_wallet, p_to_wallet) ORDER BY id FOR UPDATE;
  SELECT balance_tokens INTO v_from_balance FROM wallets WHERE id = p_from_wallet;
  IF v_from_balance IS NULL THEN RAISE EXCEPTION 'Source wallet not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM wallets WHERE id = p_to_wallet) THEN RAISE EXCEPTION 'Destination wallet not found'; END IF;

  -- An already-processed idempotency key should not debit twice.
  SELECT id INTO v_entry_id FROM token_ledger WHERE idempotency_key = p_idempotency_key;
  IF v_entry_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM token_ledger
      WHERE id = v_entry_id
        AND from_wallet_id = p_from_wallet
        AND to_wallet_id = p_to_wallet
        AND amount_tokens = p_amount
        AND entry_type = p_entry_type
        AND external_reference IS NOT DISTINCT FROM p_external_reference
    ) THEN
      RAISE EXCEPTION 'Idempotency key was already used for a different transfer';
    END IF;
    RETURN v_entry_id;
  END IF;
  IF v_from_balance < p_amount THEN RAISE EXCEPTION 'Insufficient token balance'; END IF;

  UPDATE wallets SET balance_tokens = balance_tokens - p_amount WHERE id = p_from_wallet;
  UPDATE wallets SET balance_tokens = balance_tokens + p_amount WHERE id = p_to_wallet;
  INSERT INTO token_ledger(from_wallet_id, to_wallet_id, amount_tokens, entry_type, idempotency_key, external_reference, metadata)
  VALUES (p_from_wallet, p_to_wallet, p_amount, p_entry_type, p_idempotency_key, p_external_reference, p_metadata)
  RETURNING id INTO v_entry_id;
  RETURN v_entry_id;
END;
$$;

-- Do not expose wallet transfers to arbitrary database roles. Grant this
-- function only to the restricted server-side application role after setup.
REVOKE ALL ON FUNCTION public.move_tokens(uuid, uuid, bigint, text, text, text, jsonb) FROM PUBLIC;
