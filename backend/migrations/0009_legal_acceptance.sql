CREATE SCHEMA "legal";
--> statement-breakpoint
CREATE TYPE "legal"."acceptance_purpose" AS ENUM('signup', 'first_access', 'material_update', 'subscription', 'age_confirmation', 'marketing');
--> statement-breakpoint
CREATE TYPE "legal"."change_kind" AS ENUM('material', 'non_material');
--> statement-breakpoint
CREATE TYPE "legal"."document_type" AS ENUM('terms', 'privacy', 'risk', 'refund', 'acceptable_use', 'responsible_gaming');
--> statement-breakpoint
CREATE TABLE "legal"."documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "type" "legal"."document_type" NOT NULL,
  "version" text NOT NULL,
  "title" text NOT NULL,
  "content_hash" text NOT NULL,
  "published_at" timestamp with time zone,
  "effective_at" timestamp with time zone,
  "document_url" text NOT NULL,
  "acceptance_group" text NOT NULL,
  "change_kind" "legal"."change_kind" DEFAULT 'material' NOT NULL,
  "change_summary" text NOT NULL,
  "is_active" boolean DEFAULT false NOT NULL,
  "published_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "legal_documents_type_version_uq" UNIQUE("type", "version"),
  CONSTRAINT "legal_documents_type_hash_uq" UNIQUE("type", "content_hash"),
  CONSTRAINT "legal_documents_hash_ck" CHECK ("content_hash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "legal_documents_version_not_blank_ck" CHECK (length(btrim("version")) > 0),
  CONSTRAINT "legal_documents_acceptance_group_not_blank_ck" CHECK (length(btrim("acceptance_group")) > 0)
);
--> statement-breakpoint
CREATE TABLE "legal"."acceptances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "evidence_event_id" uuid NOT NULL,
  "idempotency_key" text NOT NULL,
  "user_id" uuid NOT NULL,
  "organization_id" uuid NOT NULL,
  "legal_document_id" uuid NOT NULL,
  "document_type" "legal"."document_type" NOT NULL,
  "document_version" text NOT NULL,
  "acceptance_group" text NOT NULL,
  "acceptance_purpose" "legal"."acceptance_purpose" NOT NULL,
  "accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ip_hash" text,
  "user_agent" text,
  "content_hash" text NOT NULL,
  "document_url" text NOT NULL,
  "evidence_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "legal_acceptances_idempotency_document_uq" UNIQUE("user_id", "organization_id", "idempotency_key", "legal_document_id"),
  CONSTRAINT "legal_acceptances_hash_ck" CHECK ("content_hash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "legal_acceptances_marketing_revocation_ck" CHECK ("revoked_at" is null or "acceptance_purpose" = 'marketing')
);
--> statement-breakpoint
ALTER TABLE "legal"."documents" ADD CONSTRAINT "documents_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "iam"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "legal"."acceptances" ADD CONSTRAINT "acceptances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "iam"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "legal"."acceptances" ADD CONSTRAINT "acceptances_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "iam"."organizations"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "legal"."acceptances" ADD CONSTRAINT "acceptances_legal_document_id_documents_id_fk" FOREIGN KEY ("legal_document_id") REFERENCES "legal"."documents"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "legal_documents_one_active_type_uidx" ON "legal"."documents" ("type") WHERE "is_active" = true;
CREATE INDEX "legal_documents_type_created_idx" ON "legal"."documents" ("type", "created_at");
CREATE INDEX "legal_acceptances_user_created_idx" ON "legal"."acceptances" ("user_id", "created_at");
CREATE INDEX "legal_acceptances_organization_created_idx" ON "legal"."acceptances" ("organization_id", "created_at");
CREATE INDEX "legal_acceptances_requirement_idx" ON "legal"."acceptances" ("user_id", "organization_id", "document_type", "acceptance_group");
--> statement-breakpoint
ALTER TABLE "legal"."acceptances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "legal"."acceptances" FORCE ROW LEVEL SECURITY;
CREATE POLICY "legal_acceptances_user_organization_select" ON "legal"."acceptances"
FOR SELECT USING (
  "user_id" = nullif(current_setting('app.user_id', true), '')::uuid
  AND "organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid
);
CREATE POLICY "legal_acceptances_user_organization_insert" ON "legal"."acceptances"
FOR INSERT WITH CHECK (
  "user_id" = nullif(current_setting('app.user_id', true), '')::uuid
  AND "organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid
);
CREATE POLICY "legal_acceptances_marketing_update" ON "legal"."acceptances"
FOR UPDATE USING (
  "user_id" = nullif(current_setting('app.user_id', true), '')::uuid
  AND "organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid
  AND "acceptance_purpose" = 'marketing'
) WITH CHECK (
  "user_id" = nullif(current_setting('app.user_id', true), '')::uuid
  AND "organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid
  AND "acceptance_purpose" = 'marketing'
);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "legal"."protect_document_version"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'published legal document versions cannot be deleted';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['is_active', 'updated_at'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['is_active', 'updated_at']) THEN
    RAISE EXCEPTION 'published legal document content is immutable; create a new version';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "legal_documents_immutable_version"
BEFORE UPDATE OR DELETE ON "legal"."documents"
FOR EACH ROW EXECUTE FUNCTION "legal"."protect_document_version"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "legal"."protect_acceptance_evidence"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'legal acceptance evidence cannot be deleted';
  END IF;
  IF OLD.acceptance_purpose <> 'marketing'
     OR NEW.revoked_at IS NULL
     OR (to_jsonb(NEW) - 'revoked_at') IS DISTINCT FROM (to_jsonb(OLD) - 'revoked_at') THEN
    RAISE EXCEPTION 'legal acceptance evidence is immutable; only marketing revocation is allowed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "legal_acceptances_immutable_evidence"
BEFORE UPDATE OR DELETE ON "legal"."acceptances"
FOR EACH ROW EXECUTE FUNCTION "legal"."protect_acceptance_evidence"();
--> statement-breakpoint
INSERT INTO "legal"."documents"
  ("type", "version", "title", "content_hash", "document_url", "acceptance_group", "change_kind", "change_summary", "is_active")
VALUES
  ('terms', '0.9', 'Termos de Uso e de Prestação de Serviços', '16a34affb0a73cb1d0727080736fc66f1b2cea72d3f1b0adeb92dfd5b249ed56', '/termos-de-uso?v=0.9', 'terms-0.9-material', 'material', 'Minuta inicial; identificação, condições comerciais e revisão jurídica pendentes.', true),
  ('privacy', '0.1', 'Política de Privacidade', 'd17e4ed9010252e313eb63b1991e965fafcdcd2248cc77a884b8dd6e6c62bf73', '/politica-de-privacidade?v=0.1', 'privacy-0.1-material', 'material', 'Minuta inicial sujeita a inventário de dados, contratos e revisão jurídica.', true),
  ('risk', '0.9', 'Aviso de Risco', '02edabba9b1de6c1095b78e74ab859ca112714668e20c48c9c969747afffeef2', '/termos-de-uso?aviso=0.9#aviso-essencial', 'risk-0.9-material', 'material', 'Aviso inicial de natureza probabilística, perdas e restrição etária.', true),
  ('refund', '0.9', 'Política de Cancelamento e Reembolso', 'd17e4ed9010252e313eb63b1991e965fafcdcd2248cc77a884b8dd6e6c62bf73', '/cancelamento-e-reembolso?v=0.9', 'refund-0.9-material', 'material', 'Minuta inicial; regra comercial e gateway pendentes.', true),
  ('acceptable_use', '0.9', 'Política de Uso Aceitável', 'd17e4ed9010252e313eb63b1991e965fafcdcd2248cc77a884b8dd6e6c62bf73', '/uso-aceitavel?v=0.9', 'acceptable-use-0.9-material', 'material', 'Minuta inicial.', true),
  ('responsible_gaming', '0.9', 'Jogo Responsável', 'd17e4ed9010252e313eb63b1991e965fafcdcd2248cc77a884b8dd6e6c62bf73', '/jogo-responsavel?v=0.9', 'responsible-gaming-0.9-material', 'material', 'Orientações iniciais de prevenção e uso moderado.', true);

-- Rollback operacional (executar somente em ambiente controlado e antes de haver aceites):
-- DROP SCHEMA legal CASCADE;
