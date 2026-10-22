-- Persist the creator/business data the preview UI used to fake. Keep new
-- comments and uploaded files private until a moderator has reviewed them.

ALTER TABLE profile_comments
  DROP CONSTRAINT IF EXISTS profile_comments_status_check;
ALTER TABLE profile_comments
  ADD CONSTRAINT profile_comments_status_check
  CHECK (status IN ('pending', 'visible', 'hidden', 'removed'));

ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS upload_status text NOT NULL DEFAULT 'uploaded'
    CHECK (upload_status IN ('awaiting_upload', 'uploaded', 'failed')),
  ADD COLUMN IF NOT EXISTS moderated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS moderated_at timestamptz,
  ADD COLUMN IF NOT EXISTS moderation_notes text NOT NULL DEFAULT '';

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolution text NOT NULL DEFAULT '';

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS client_request_id uuid,
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'sent'
    CHECK (delivery_status IN ('pending', 'sent', 'failed')),
  ADD COLUMN IF NOT EXISTS delivery_error text NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS messages_sender_request_unique
  ON messages(sender_user_id, client_request_id) WHERE client_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS media_assets_review_queue_idx
  ON media_assets(created_at) WHERE moderation_status = 'pending' AND upload_status = 'uploaded';
CREATE INDEX IF NOT EXISTS profile_comments_review_queue_idx
  ON profile_comments(created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS reports_review_queue_idx
  ON reports(created_at) WHERE status IN ('open', 'reviewing');

-- Every account needs its role-specific profile before it can participate in
-- creator discovery or messaging. Existing accounts receive a stable handle.
INSERT INTO client_profiles(user_id, handle)
SELECT u.id,
       '@' || COALESCE(NULLIF(trim(both '-' from regexp_replace(lower(u.display_name), '[^a-z0-9]+', '-', 'g')), ''), 'member')
         || '-' || left(replace(u.id::text, '-', ''), 8)
FROM users u
WHERE u.role = 'client'
  AND NOT EXISTS (SELECT 1 FROM client_profiles p WHERE p.user_id = u.id)
ON CONFLICT DO NOTHING;

INSERT INTO model_profiles(user_id, handle)
SELECT u.id,
       '@' || COALESCE(NULLIF(trim(both '-' from regexp_replace(lower(u.display_name), '[^a-z0-9]+', '-', 'g')), ''), 'creator')
         || '-' || left(replace(u.id::text, '-', ''), 8)
FROM users u
WHERE u.role = 'model'
  AND NOT EXISTS (SELECT 1 FROM model_profiles p WHERE p.user_id = u.id)
ON CONFLICT DO NOTHING;
