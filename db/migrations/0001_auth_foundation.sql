-- Apply after db/schema.sql. This migration adds server-side auth state and
-- privacy-preserving rate limiting. The app must connect with a restricted
-- server-only database role.

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_expiry_idx
  ON auth_sessions(user_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS email_verification_user_expiry_idx
  ON email_verification_tokens(user_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  bucket_hash text PRIMARY KEY CHECK (bucket_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz NOT NULL,
  hit_count integer NOT NULL CHECK (hit_count > 0)
);

CREATE OR REPLACE FUNCTION consume_auth_rate_limit(
  p_bucket_hash text,
  p_max_hits integer,
  p_window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_hits integer;
BEGIN
  IF p_max_hits < 1 OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'Invalid rate limit';
  END IF;

  INSERT INTO auth_rate_limits(bucket_hash, window_started_at, hit_count)
  VALUES (p_bucket_hash, now(), 1)
  ON CONFLICT (bucket_hash) DO UPDATE SET
    window_started_at = CASE
      WHEN auth_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
        THEN now()
      ELSE auth_rate_limits.window_started_at
    END,
    hit_count = CASE
      WHEN auth_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
        THEN 1
      ELSE auth_rate_limits.hit_count + 1
    END
  RETURNING hit_count INTO v_hits;

  RETURN v_hits <= p_max_hits;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_auth_rate_limit(text, integer, integer) FROM PUBLIC;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_case_insensitive_unique
  ON users (lower(email));

CREATE TABLE IF NOT EXISTS security_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  subject_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_audit_events_subject_idx
  ON security_audit_events(subject_user_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_security_audit_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Security audit events are immutable';
END;
$$;
DROP TRIGGER IF EXISTS security_audit_events_immutable ON security_audit_events;
CREATE TRIGGER security_audit_events_immutable
  BEFORE UPDATE OR DELETE ON security_audit_events
  FOR EACH ROW EXECUTE FUNCTION prevent_security_audit_mutation();

-- Age verification sessions are added by 0002_yoti_age_verification.sql.
