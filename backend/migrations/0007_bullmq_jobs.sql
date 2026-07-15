-- Durable outbox and worker metadata. Redis coordinates delivery; PostgreSQL
-- remains the source of truth for job state and idempotency.
ALTER TABLE ops.background_jobs
  ADD COLUMN payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN request_id uuid,
  ADD COLUMN dataset_version_id uuid REFERENCES model.dataset_versions(id) ON DELETE RESTRICT,
  ADD COLUMN model_version_id uuid REFERENCES model.model_versions(id) ON DELETE RESTRICT,
  ADD COLUMN dispatched_at timestamptz,
  ADD COLUMN dispatch_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN timeout_ms integer NOT NULL DEFAULT 900000,
  ADD COLUMN cancel_requested_at timestamptz,
  ADD COLUMN result_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE ops.background_jobs
  ADD CONSTRAINT background_jobs_dispatch_attempts_ck CHECK (dispatch_attempts >= 0),
  ADD CONSTRAINT background_jobs_timeout_ck CHECK (timeout_ms > 0);

CREATE INDEX background_jobs_outbox_idx
  ON ops.background_jobs (scheduled_at, created_at)
  WHERE dispatched_at IS NULL AND status = 'queued';

CREATE INDEX background_jobs_queue_status_idx
  ON ops.background_jobs (queue, status, created_at);

ALTER TABLE model.model_versions
  ADD COLUMN source_job_id uuid REFERENCES ops.background_jobs(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX model_versions_source_job_uidx
  ON model.model_versions (source_job_id)
  WHERE source_job_id IS NOT NULL;

ALTER TABLE model.evaluations
  ADD COLUMN source_job_id uuid REFERENCES ops.background_jobs(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX evaluations_source_job_uidx
  ON model.evaluations (source_job_id)
  WHERE source_job_id IS NOT NULL;

CREATE TABLE ops.dead_letter_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  background_job_id uuid NOT NULL UNIQUE REFERENCES ops.background_jobs(id) ON DELETE RESTRICT,
  scope ops.operational_scope NOT NULL,
  organization_id uuid REFERENCES iam.organizations(id) ON DELETE RESTRICT,
  requested_by_user_id uuid REFERENCES iam.users(id) ON DELETE RESTRICT,
  queue text NOT NULL,
  job_type text NOT NULL,
  attempts integer NOT NULL,
  failure_code text NOT NULL,
  request_id uuid,
  dataset_version_id uuid REFERENCES model.dataset_versions(id) ON DELETE RESTRICT,
  model_version_id uuid REFERENCES model.model_versions(id) ON DELETE RESTRICT,
  failed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dead_letter_jobs_scope_organization_ck CHECK (
    (scope = 'system' AND organization_id IS NULL)
    OR (scope = 'organization' AND organization_id IS NOT NULL)
  ),
  CONSTRAINT dead_letter_jobs_attempts_ck CHECK (attempts > 0)
);

CREATE INDEX dead_letter_jobs_queue_failed_idx
  ON ops.dead_letter_jobs (queue, failed_at DESC);
CREATE INDEX dead_letter_jobs_organization_failed_idx
  ON ops.dead_letter_jobs (organization_id, failed_at DESC);

CREATE TABLE ops.provider_api_usage (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider text NOT NULL,
  period_type text NOT NULL,
  period_start date NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  quota_limit integer NOT NULL,
  alert_threshold integer NOT NULL,
  alerted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_api_usage_period_ck CHECK (period_type IN ('daily', 'monthly')),
  CONSTRAINT provider_api_usage_counts_ck CHECK (
    request_count >= 0 AND quota_limit > 0
    AND alert_threshold > 0 AND alert_threshold <= quota_limit
  ),
  CONSTRAINT provider_api_usage_provider_period_uq UNIQUE (provider, period_type, period_start)
);

CREATE INDEX provider_api_usage_period_idx
  ON ops.provider_api_usage (provider, period_type, period_start DESC);

ALTER TABLE ops.dead_letter_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.dead_letter_jobs FORCE ROW LEVEL SECURITY;

DROP POLICY background_jobs_scope_isolation ON ops.background_jobs;
CREATE POLICY background_jobs_scope_isolation ON ops.background_jobs
USING (
  current_setting('app.service_role', true) IN ('worker', 'scheduler')
  OR (
    scope = 'organization'
    AND organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  )
  OR (
    scope = 'system'
    AND organization_id IS NULL
    AND requested_by_user_id = nullif(current_setting('app.user_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM iam.memberships membership
      WHERE membership.user_id = nullif(current_setting('app.user_id', true), '')::uuid
        AND membership.organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
        AND membership.status = 'active'
        AND membership.role IN ('owner', 'admin')
    )
  )
)
WITH CHECK (
  current_setting('app.service_role', true) IN ('worker', 'scheduler')
  OR (
    scope = 'organization'
    AND organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  )
  OR (
    scope = 'system'
    AND organization_id IS NULL
    AND requested_by_user_id = nullif(current_setting('app.user_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM iam.memberships membership
      WHERE membership.user_id = nullif(current_setting('app.user_id', true), '')::uuid
        AND membership.organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
        AND membership.status = 'active'
        AND membership.role IN ('owner', 'admin')
    )
  )
);

CREATE POLICY dead_letter_jobs_scope_isolation ON ops.dead_letter_jobs
USING (
  current_setting('app.service_role', true) = 'worker'
  OR (
    scope = 'organization'
    AND organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  )
  OR (
    scope = 'system'
    AND requested_by_user_id = nullif(current_setting('app.user_id', true), '')::uuid
  )
)
WITH CHECK (current_setting('app.service_role', true) = 'worker');

DROP POLICY audit_log_organization_isolation ON ops.audit_log;
CREATE POLICY audit_log_scope_isolation ON ops.audit_log
USING (
  current_setting('app.service_role', true) IN ('worker', 'scheduler')
  OR organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
)
WITH CHECK (
  current_setting('app.service_role', true) IN ('worker', 'scheduler')
  OR organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
);

COMMENT ON TABLE ops.provider_api_usage IS
  'Server-side daily/monthly provider quota counters; never sourced from clients.';
COMMENT ON TABLE ops.dead_letter_jobs IS
  'Metadata-only dead letter registry. Payloads and secrets are deliberately excluded.';
