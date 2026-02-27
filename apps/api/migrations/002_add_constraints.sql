-- Add CHECK constraint on status column (idempotent via DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'health_checks_status_check'
  ) THEN
    ALTER TABLE health_checks
      ADD CONSTRAINT health_checks_status_check
      CHECK (status IN ('connected', 'error', 'not configured'));
  END IF;
END
$$;

-- Add index on checked_at for time-range queries
CREATE INDEX IF NOT EXISTS idx_health_checks_checked_at ON health_checks (checked_at);
