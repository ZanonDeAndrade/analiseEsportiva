ALTER TYPE "model"."model_status" ADD VALUE 'challenger' BEFORE 'ready';--> statement-breakpoint
ALTER TYPE "model"."model_status" ADD VALUE 'rejected' BEFORE 'failed';--> statement-breakpoint
CREATE TABLE "model"."model_promotion_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_version_id" uuid NOT NULL,
	"previous_champion_id" uuid,
	"action" text NOT NULL,
	"decision" jsonb NOT NULL,
	"source_job_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_promotion_events_action_ck" CHECK ("model"."model_promotion_events"."action" in ('promote', 'reject', 'rollback'))
);
--> statement-breakpoint
ALTER TABLE "model"."model_versions" ADD COLUMN "code_version" text;--> statement-breakpoint
ALTER TABLE "model"."model_versions" ADD COLUMN "feature_set_version" text;--> statement-breakpoint
ALTER TABLE "model"."model_versions" ADD COLUMN "model_schema_version" text;--> statement-breakpoint
ALTER TABLE "model"."model_versions" ADD COLUMN "hyperparameters" jsonb;--> statement-breakpoint
ALTER TABLE "model"."model_versions" ADD COLUMN "artifact_fingerprint" text;--> statement-breakpoint
UPDATE model.model_versions SET
  code_version = 'legacy-unknown',
  feature_set_version = 'legacy-features-v1',
  model_schema_version = 'legacy-model-v1',
  hyperparameters = jsonb_build_object('minRows', min_rows, 'seed', 2026),
  artifact_fingerprint = payload_sha256,
  status = CASE WHEN status = 'ready' THEN 'retired'::model.model_status ELSE status END,
  retired_at = CASE WHEN status = 'ready' THEN now() ELSE retired_at END
WHERE code_version IS NULL;--> statement-breakpoint
ALTER TABLE model.model_versions ALTER COLUMN code_version SET NOT NULL;--> statement-breakpoint
ALTER TABLE model.model_versions ALTER COLUMN feature_set_version SET NOT NULL;--> statement-breakpoint
ALTER TABLE model.model_versions ALTER COLUMN model_schema_version SET NOT NULL;--> statement-breakpoint
ALTER TABLE model.model_versions ALTER COLUMN hyperparameters SET NOT NULL;--> statement-breakpoint
ALTER TABLE model.model_versions ALTER COLUMN artifact_fingerprint SET NOT NULL;--> statement-breakpoint
ALTER TABLE "model"."model_promotion_events" ADD CONSTRAINT "model_promotion_events_model_version_id_model_versions_id_fk" FOREIGN KEY ("model_version_id") REFERENCES "model"."model_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model"."model_promotion_events" ADD CONSTRAINT "model_promotion_events_previous_champion_id_model_versions_id_fk" FOREIGN KEY ("previous_champion_id") REFERENCES "model"."model_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "model_promotion_events_model_created_idx" ON "model"."model_promotion_events" USING btree ("model_version_id","created_at");--> statement-breakpoint
ALTER TABLE "model"."model_versions" ADD CONSTRAINT "model_versions_artifact_fingerprint_uq" UNIQUE("artifact_fingerprint");
