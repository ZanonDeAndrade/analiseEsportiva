-- Expand/secure migration for organization tenancy. This migration is intentionally
-- explicit because Drizzle does not model PostgreSQL RLS policies.

ALTER TYPE iam.membership_role RENAME VALUE 'analyst' TO 'member';

UPDATE iam.session_metadata AS session
SET organization_id = (
  SELECT membership.organization_id
  FROM iam.memberships AS membership
  WHERE membership.user_id = session.user_id
    AND membership.status = 'active'
  ORDER BY membership.created_at
  LIMIT 1
)
WHERE session.organization_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM iam.session_metadata WHERE organization_id IS NULL) THEN
    RAISE EXCEPTION 'session_metadata without active organization cannot be migrated';
  END IF;
END;
$$;

ALTER TABLE iam.session_metadata ALTER COLUMN organization_id SET NOT NULL;

CREATE UNIQUE INDEX memberships_one_active_owner_uidx
  ON iam.memberships (organization_id)
  WHERE status = 'active' AND role = 'owner';

-- Private/control-plane tables. The application and worker database roles must be
-- NOSUPERUSER, NOBYPASSRLS and must not own these tables.
ALTER TABLE iam.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam.organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE iam.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam.memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE iam.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam.invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE iam.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam.api_keys FORCE ROW LEVEL SECURITY;
ALTER TABLE iam.session_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam.session_metadata FORCE ROW LEVEL SECURITY;

ALTER TABLE billing.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE billing.usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.usage_records FORCE ROW LEVEL SECURITY;
ALTER TABLE billing.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.invoices FORCE ROW LEVEL SECURITY;

ALTER TABLE model.predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE model.predictions FORCE ROW LEVEL SECURITY;

ALTER TABLE ops.exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.exports FORCE ROW LEVEL SECURITY;
ALTER TABLE ops.background_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.background_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE ops.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.audit_log FORCE ROW LEVEL SECURITY;

CREATE POLICY organizations_select ON iam.organizations
FOR SELECT
USING (
  id = nullif(current_setting('app.organization_id', true), '')::uuid
  OR EXISTS (
    SELECT 1
    FROM iam.memberships AS membership
    WHERE membership.organization_id = organizations.id
      AND membership.user_id = nullif(current_setting('app.user_id', true), '')::uuid
      AND membership.status = 'active'
  )
);

CREATE POLICY organizations_write ON iam.organizations
FOR ALL
USING (id = nullif(current_setting('app.organization_id', true), '')::uuid)
WITH CHECK (id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY memberships_select ON iam.memberships
FOR SELECT
USING (
  organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  OR user_id = nullif(current_setting('app.user_id', true), '')::uuid
);

CREATE POLICY memberships_write ON iam.memberships
FOR ALL
USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY invitations_select ON iam.invitations
FOR SELECT
USING (
  organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  OR email_normalized = nullif(current_setting('app.user_email', true), '')
);

CREATE POLICY invitations_write ON iam.invitations
FOR ALL
USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY api_keys_organization_isolation ON iam.api_keys
USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY session_metadata_isolation ON iam.session_metadata
USING (
  user_id = nullif(current_setting('app.user_id', true), '')::uuid
  OR organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
)
WITH CHECK (
  user_id = nullif(current_setting('app.user_id', true), '')::uuid
  OR organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
);

CREATE POLICY subscriptions_organization_isolation ON billing.subscriptions
USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY usage_records_organization_isolation ON billing.usage_records
USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY invoices_organization_isolation ON billing.invoices
USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY predictions_organization_isolation ON model.predictions
USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY exports_organization_isolation ON ops.exports
USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY background_jobs_organization_isolation ON ops.background_jobs
USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY audit_log_organization_isolation ON ops.audit_log
USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

COMMENT ON POLICY memberships_select ON iam.memberships IS
  'Users may discover only their own active organizations; active-organization administration remains scoped.';
COMMENT ON TABLE iam.users IS
  'Global identity principal keyed by provider subject; it is not a tenant-owned resource.';
