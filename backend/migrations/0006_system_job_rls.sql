-- System-scoped jobs remain global, but only an authenticated owner/admin from
-- the active organization may create or read their own request metadata.
DROP POLICY background_jobs_organization_isolation ON ops.background_jobs;

CREATE POLICY background_jobs_scope_isolation ON ops.background_jobs
USING (
  (
    scope = 'organization'
    AND organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  )
  OR
  (
    scope = 'system'
    AND organization_id IS NULL
    AND requested_by_user_id = nullif(current_setting('app.user_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM iam.memberships membership
      WHERE membership.user_id = nullif(current_setting('app.user_id', true), '')::uuid
        AND membership.organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
        AND membership.status = 'active'
        AND membership.role IN ('owner', 'admin')
    )
  )
)
WITH CHECK (
  (
    scope = 'organization'
    AND organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  )
  OR
  (
    scope = 'system'
    AND organization_id IS NULL
    AND requested_by_user_id = nullif(current_setting('app.user_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM iam.memberships membership
      WHERE membership.user_id = nullif(current_setting('app.user_id', true), '')::uuid
        AND membership.organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
        AND membership.status = 'active'
        AND membership.role IN ('owner', 'admin')
    )
  )
);

COMMENT ON POLICY background_jobs_scope_isolation ON ops.background_jobs IS
  'Organization jobs use tenant context; system jobs require the requesting owner/admin and never impersonate a tenant-owned job.';
