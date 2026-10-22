-- Yoti Age Verification session tracking. Apply after 0001_auth_foundation.sql.
-- Store only the provider session/reference and result state; never store raw ID,
-- selfie, biometric, or full Yoti result payloads.

CREATE TABLE IF NOT EXISTS age_verification_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'yoti' CHECK (provider = 'yoti'),
  reference_id text NOT NULL UNIQUE,
  provider_session_id text UNIQUE,
  status text NOT NULL DEFAULT 'creating' CHECK (
    status IN ('creating', 'pending', 'in_progress', 'complete', 'failed', 'error', 'cancelled', 'expired')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS age_verification_user_history_idx
  ON age_verification_sessions(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS age_verification_one_open_session_per_user_idx
  ON age_verification_sessions(user_id)
  WHERE status IN ('creating', 'pending', 'in_progress');

-- The application connection should use a dedicated restricted database role.
-- Revoke broad access to age-check evidence and grant the app role only the
-- operations it needs as part of deployment provisioning.
