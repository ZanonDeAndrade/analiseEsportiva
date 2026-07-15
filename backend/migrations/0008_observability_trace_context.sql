-- Expand-only observability migration. Rollback is application-first: the new
-- column and indexes are safe for older releases and may remain in place.
ALTER TABLE ops.background_jobs
  ADD COLUMN IF NOT EXISTS trace_context jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS audit_log_action_created_idx
  ON ops.audit_log (action, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_log_request_idx
  ON ops.audit_log (request_id, created_at DESC)
  WHERE request_id IS NOT NULL;
