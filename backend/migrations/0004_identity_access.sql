ALTER TABLE "iam"."session_metadata" ADD COLUMN "authenticated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "iam"."session_metadata" ADD COLUMN "user_agent" text;--> statement-breakpoint
ALTER TABLE "iam"."session_metadata" ADD COLUMN "ip_hash" text;--> statement-breakpoint
ALTER TABLE "iam"."session_metadata" ADD COLUMN "revoked_reason" text;--> statement-breakpoint
ALTER TABLE "iam"."users" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "iam"."users" ADD COLUMN "provider_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "iam"."users" ADD COLUMN "last_identity_sync_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "iam"."users" ADD COLUMN "disabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "iam"."users" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "session_metadata_user_revoked_idx" ON "iam"."session_metadata" USING btree ("user_id","revoked_at");--> statement-breakpoint
ALTER TABLE "iam"."session_metadata" ADD CONSTRAINT "session_metadata_revocation_ck" CHECK (("iam"."session_metadata"."revoked_at" is null and "iam"."session_metadata"."revoked_reason" is null) or ("iam"."session_metadata"."revoked_at" is not null and "iam"."session_metadata"."revoked_reason" is not null));--> statement-breakpoint
ALTER TABLE "iam"."users" ADD CONSTRAINT "users_status_timestamps_ck" CHECK (("iam"."users"."status" = 'active' and "iam"."users"."disabled_at" is null and "iam"."users"."deleted_at" is null) or ("iam"."users"."status" = 'disabled' and "iam"."users"."disabled_at" is not null));