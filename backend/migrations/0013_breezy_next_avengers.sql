CREATE TABLE "ops"."incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"severity" text NOT NULL,
	"status" text DEFAULT 'investigating' NOT NULL,
	"owner_team" text NOT NULL,
	"encrypted_content" text NOT NULL,
	"content_iv" text NOT NULL,
	"content_auth_tag" text NOT NULL,
	"encryption_key_version" text NOT NULL,
	"public_reference" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incidents_severity_ck" CHECK ("ops"."incidents"."severity" in ('sev1','sev2','sev3','sev4')),
	CONSTRAINT "incidents_status_ck" CHECK ("ops"."incidents"."status" in ('investigating','identified','monitoring','resolved')),
	CONSTRAINT "incidents_owner_ck" CHECK ("ops"."incidents"."owner_team" in ('support','engineering','security','billing','privacy'))
);
--> statement-breakpoint
CREATE TABLE "ops"."support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"category" text NOT NULL,
	"severity" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"owner_team" text DEFAULT 'support' NOT NULL,
	"encrypted_content" text NOT NULL,
	"content_iv" text NOT NULL,
	"content_auth_tag" text NOT NULL,
	"encryption_key_version" text NOT NULL,
	"sla_due_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_tickets_category_ck" CHECK ("ops"."support_tickets"."category" in ('access','billing','data','privacy','security','technical','other')),
	CONSTRAINT "support_tickets_severity_ck" CHECK ("ops"."support_tickets"."severity" in ('sev1','sev2','sev3','sev4')),
	CONSTRAINT "support_tickets_status_ck" CHECK ("ops"."support_tickets"."status" in ('open','in_progress','waiting_customer','resolved')),
	CONSTRAINT "support_tickets_owner_ck" CHECK ("ops"."support_tickets"."owner_team" in ('support','engineering','security','billing','privacy'))
);
--> statement-breakpoint
ALTER TABLE "ops"."incidents" ADD CONSTRAINT "incidents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "iam"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops"."incidents" ADD CONSTRAINT "incidents_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "iam"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops"."support_tickets" ADD CONSTRAINT "support_tickets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "iam"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops"."support_tickets" ADD CONSTRAINT "support_tickets_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "iam"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "incidents_organization_status_idx" ON "ops"."incidents" USING btree ("organization_id","status","created_at");--> statement-breakpoint
CREATE INDEX "support_tickets_organization_status_idx" ON "ops"."support_tickets" USING btree ("organization_id","status","created_at");--> statement-breakpoint
CREATE INDEX "support_tickets_creator_created_idx" ON "ops"."support_tickets" USING btree ("created_by_user_id","created_at");
--> statement-breakpoint
CREATE TRIGGER support_tickets_set_updated_at
BEFORE UPDATE ON ops.support_tickets
FOR EACH ROW EXECUTE FUNCTION ops.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER incidents_set_updated_at
BEFORE UPDATE ON ops.incidents
FOR EACH ROW EXECUTE FUNCTION ops.set_updated_at();
--> statement-breakpoint
ALTER TABLE ops.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.support_tickets FORCE ROW LEVEL SECURITY;
ALTER TABLE ops.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.incidents FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY support_tickets_select ON ops.support_tickets
FOR SELECT USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY support_tickets_insert ON ops.support_tickets
FOR INSERT WITH CHECK (
  organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  AND created_by_user_id = nullif(current_setting('app.user_id', true), '')::uuid
);
CREATE POLICY support_tickets_update ON ops.support_tickets
FOR UPDATE USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY support_tickets_delete ON ops.support_tickets
FOR DELETE USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY incidents_select ON ops.incidents
FOR SELECT USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY incidents_insert ON ops.incidents
FOR INSERT WITH CHECK (
  organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  AND created_by_user_id = nullif(current_setting('app.user_id', true), '')::uuid
);
CREATE POLICY incidents_update ON ops.incidents
FOR UPDATE USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY incidents_delete ON ops.incidents
FOR DELETE USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ops.expired_export_object_keys(p_now timestamptz)
RETURNS TABLE(object_key text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, ops
AS $$
  SELECT e.object_key
  FROM ops.exports e
  WHERE e.expires_at IS NOT NULL
    AND e.expires_at <= p_now
    AND e.object_key IS NOT NULL
  ORDER BY e.id;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ops.purge_expired_private_data(p_now timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ops, iam
AS $$
DECLARE
  session_count integer := 0;
  invitation_count integer := 0;
  export_count integer := 0;
  ticket_count integer := 0;
  incident_count integer := 0;
  job_count integer := 0;
BEGIN
  DELETE FROM iam.session_metadata
   WHERE expires_at < p_now - interval '7 days'
      OR (revoked_at IS NOT NULL AND revoked_at < p_now - interval '30 days');
  GET DIAGNOSTICS session_count = ROW_COUNT;

  DELETE FROM iam.invitations
   WHERE (status IN ('expired', 'revoked') AND updated_at < p_now - interval '30 days')
      OR (status = 'pending' AND expires_at < p_now - interval '30 days');
  GET DIAGNOSTICS invitation_count = ROW_COUNT;

  DELETE FROM ops.exports WHERE expires_at IS NOT NULL AND expires_at <= p_now;
  GET DIAGNOSTICS export_count = ROW_COUNT;

  DELETE FROM ops.support_tickets
   WHERE status = 'resolved' AND resolved_at < p_now - interval '365 days';
  GET DIAGNOSTICS ticket_count = ROW_COUNT;

  DELETE FROM ops.incidents
   WHERE status = 'resolved' AND resolved_at < p_now - interval '730 days';
  GET DIAGNOSTICS incident_count = ROW_COUNT;

  UPDATE ops.background_jobs
     SET payload = '{}'::jsonb, result_metadata = '{}'::jsonb, updated_at = p_now
   WHERE status IN ('succeeded', 'failed', 'cancelled')
     AND completed_at < p_now - interval '90 days'
     AND (payload <> '{}'::jsonb OR result_metadata <> '{}'::jsonb);
  GET DIAGNOSTICS job_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'sessions', session_count,
    'invitations', invitation_count,
    'exports', export_count,
    'supportTickets', ticket_count,
    'incidents', incident_count,
    'jobs', job_count
  );
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION ops.expired_export_object_keys(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION ops.purge_expired_private_data(timestamptz) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'betintel_worker') THEN
    GRANT EXECUTE ON FUNCTION ops.expired_export_object_keys(timestamptz) TO betintel_worker;
    GRANT EXECUTE ON FUNCTION ops.purge_expired_private_data(timestamptz) TO betintel_worker;
  END IF;
END
$$;
--> statement-breakpoint
COMMENT ON COLUMN ops.support_tickets.encrypted_content IS
  'AES-256-GCM ciphertext. Plain subject/description are prohibited in logs and audit metadata.';
COMMENT ON FUNCTION ops.purge_expired_private_data(timestamptz) IS
  'Narrow SECURITY DEFINER retention entrypoint. Execute permission belongs only to the maintenance worker role.';
