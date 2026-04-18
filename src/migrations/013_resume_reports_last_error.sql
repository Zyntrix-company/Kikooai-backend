-- Persist the last handler error on the report row so polling stays informative
-- even when jobs.error_message is cleared during retries or progress updates.
ALTER TABLE resume_reports
  ADD COLUMN IF NOT EXISTS last_error TEXT;
