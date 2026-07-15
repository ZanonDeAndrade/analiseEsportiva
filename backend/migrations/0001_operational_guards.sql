-- Operational guards that are intentionally explicit SQL rather than hidden
-- behind the ORM. Keep this migration immutable after it reaches a shared DB.

CREATE UNIQUE INDEX invitations_pending_email_uidx
  ON iam.invitations (organization_id, email_normalized)
  WHERE status = 'pending';

CREATE UNIQUE INDEX subscriptions_current_organization_uidx
  ON billing.subscriptions (organization_id)
  WHERE status IN ('trialing', 'active', 'past_due', 'paused');

CREATE INDEX fixtures_scheduled_starts_idx
  ON sports.fixtures (starts_at)
  WHERE status = 'scheduled';

CREATE UNIQUE INDEX model_versions_active_key_uidx
  ON model.model_versions (model_key)
  WHERE status = 'ready' AND retired_at IS NULL;

CREATE OR REPLACE FUNCTION ops.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER organizations_set_updated_at
BEFORE UPDATE ON iam.organizations
FOR EACH ROW EXECUTE FUNCTION ops.set_updated_at();

CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON iam.users
FOR EACH ROW EXECUTE FUNCTION ops.set_updated_at();

CREATE TRIGGER memberships_set_updated_at
BEFORE UPDATE ON iam.memberships
FOR EACH ROW EXECUTE FUNCTION ops.set_updated_at();

CREATE TRIGGER invitations_set_updated_at
BEFORE UPDATE ON iam.invitations
FOR EACH ROW EXECUTE FUNCTION ops.set_updated_at();

CREATE TRIGGER plans_set_updated_at
BEFORE UPDATE ON billing.plans
FOR EACH ROW EXECUTE FUNCTION ops.set_updated_at();

CREATE TRIGGER subscriptions_set_updated_at
BEFORE UPDATE ON billing.subscriptions
FOR EACH ROW EXECUTE FUNCTION ops.set_updated_at();

CREATE TRIGGER invoices_set_updated_at
BEFORE UPDATE ON billing.invoices
FOR EACH ROW EXECUTE FUNCTION ops.set_updated_at();

CREATE TRIGGER competitions_set_updated_at
BEFORE UPDATE ON sports.competitions
FOR EACH ROW EXECUTE FUNCTION ops.set_updated_at();

CREATE TRIGGER seasons_set_updated_at
BEFORE UPDATE ON sports.seasons
FOR EACH ROW EXECUTE FUNCTION ops.set_updated_at();

CREATE TRIGGER teams_set_updated_at
BEFORE UPDATE ON sports.teams
FOR EACH ROW EXECUTE FUNCTION ops.set_updated_at();

CREATE TRIGGER fixtures_set_updated_at
BEFORE UPDATE ON sports.fixtures
FOR EACH ROW EXECUTE FUNCTION ops.set_updated_at();

CREATE TRIGGER exports_set_updated_at
BEFORE UPDATE ON ops.exports
FOR EACH ROW EXECUTE FUNCTION ops.set_updated_at();

CREATE TRIGGER background_jobs_set_updated_at
BEFORE UPDATE ON ops.background_jobs
FOR EACH ROW EXECUTE FUNCTION ops.set_updated_at();

CREATE OR REPLACE FUNCTION ops.reject_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ops.audit_log is append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER audit_log_append_only
BEFORE UPDATE OR DELETE ON ops.audit_log
FOR EACH ROW EXECUTE FUNCTION ops.reject_audit_log_mutation();

COMMENT ON TABLE ops.audit_log IS
  'Append-only audit metadata. Secrets, tokens, PII and payment payloads are prohibited.';

COMMENT ON TABLE billing.webhook_events IS
  'Idempotency and processing metadata only; raw payment payloads are not persisted.';
