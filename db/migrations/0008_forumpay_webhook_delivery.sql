-- Count HTTP deliveries separately from API polling discoveries.
ALTER TABLE forumpay_sandbox_notifications
  ADD COLUMN IF NOT EXISTS delivery_count integer NOT NULL DEFAULT 0 CHECK (delivery_count >= 0),
  ADD COLUMN IF NOT EXISTS last_delivery_at timestamptz;
