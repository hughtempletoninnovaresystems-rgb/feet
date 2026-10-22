-- Run daily from a trusted scheduler after reviewing the operator's retention
-- policy. This expires old age-verification sessions and removes expired authentication
-- state and rate-limit keys. Retain age-verification history per the approved
-- retention policy; this script does not delete it.
BEGIN;

DELETE FROM auth_sessions
WHERE expires_at < now() - interval '30 days'
   OR revoked_at < now() - interval '30 days';

DELETE FROM email_verification_tokens
WHERE expires_at < now() OR used_at < now() - interval '30 days';

DELETE FROM password_reset_tokens
WHERE expires_at < now() OR used_at < now() - interval '30 days';

DELETE FROM auth_rate_limits
WHERE window_started_at < now() - interval '1 day';

UPDATE age_verification_sessions
SET status = 'expired', updated_at = now()
WHERE status IN ('creating', 'pending', 'in_progress') AND expires_at <= now();

-- Replays older than the 5-minute signed-body timestamp window are rejected,
-- so keep webhook receipt IDs long enough to cover provider retry and audit windows.
DELETE FROM didit_webhook_events
WHERE received_at < now() - interval '30 days';

COMMIT;
