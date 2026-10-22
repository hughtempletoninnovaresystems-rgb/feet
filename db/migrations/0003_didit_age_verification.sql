-- Switch new age-verification sessions to Didit while retaining legacy Yoti
-- rows for audit history. Apply after 0002_yoti_age_verification.sql.

ALTER TABLE age_verification_sessions
  ALTER COLUMN provider SET DEFAULT 'didit';

ALTER TABLE age_verification_sessions
  DROP CONSTRAINT IF EXISTS age_verification_sessions_provider_check;

ALTER TABLE age_verification_sessions
  ADD CONSTRAINT age_verification_sessions_provider_check
  CHECK (provider IN ('yoti', 'didit'));

DROP INDEX IF EXISTS age_verification_one_open_session_per_user_idx;
CREATE UNIQUE INDEX age_verification_one_open_session_per_user_idx
  ON age_verification_sessions(user_id, provider)
  WHERE status IN ('creating', 'pending', 'in_progress');
