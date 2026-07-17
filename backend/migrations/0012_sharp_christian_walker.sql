CREATE TABLE "ops"."alert_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"saved_query_id" uuid,
	"name" text NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"status" text DEFAULT 'paused' NOT NULL,
	"delivery_state" text DEFAULT 'not_configured' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alert_rules_name_ck" CHECK (char_length("ops"."alert_rules"."name") between 2 and 80),
	CONSTRAINT "alert_rules_channel_ck" CHECK ("ops"."alert_rules"."channel" in ('email', 'in_app')),
	CONSTRAINT "alert_rules_status_ck" CHECK ("ops"."alert_rules"."status" in ('paused', 'active')),
	CONSTRAINT "alert_rules_delivery_ck" CHECK ("ops"."alert_rules"."delivery_state" in ('configured', 'not_configured', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "ops"."saved_queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"filters" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_queries_organization_user_name_uq" UNIQUE("organization_id","created_by_user_id","name"),
	CONSTRAINT "saved_queries_name_ck" CHECK (char_length("ops"."saved_queries"."name") between 2 and 80)
);
--> statement-breakpoint
ALTER TABLE "ops"."alert_rules" ADD CONSTRAINT "alert_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "iam"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops"."alert_rules" ADD CONSTRAINT "alert_rules_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "iam"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops"."alert_rules" ADD CONSTRAINT "alert_rules_saved_query_id_saved_queries_id_fk" FOREIGN KEY ("saved_query_id") REFERENCES "ops"."saved_queries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops"."saved_queries" ADD CONSTRAINT "saved_queries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "iam"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops"."saved_queries" ADD CONSTRAINT "saved_queries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "iam"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alert_rules_organization_updated_idx" ON "ops"."alert_rules" USING btree ("organization_id","updated_at");--> statement-breakpoint
CREATE INDEX "saved_queries_organization_updated_idx" ON "ops"."saved_queries" USING btree ("organization_id","updated_at");
--> statement-breakpoint
ALTER TABLE ops.saved_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.saved_queries FORCE ROW LEVEL SECURITY;
ALTER TABLE ops.alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.alert_rules FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY saved_queries_actor_isolation ON ops.saved_queries
USING (
  organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  AND created_by_user_id = nullif(current_setting('app.user_id', true), '')::uuid
)
WITH CHECK (
  organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  AND created_by_user_id = nullif(current_setting('app.user_id', true), '')::uuid
);
--> statement-breakpoint
CREATE POLICY alert_rules_actor_isolation ON ops.alert_rules
USING (
  organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  AND created_by_user_id = nullif(current_setting('app.user_id', true), '')::uuid
)
WITH CHECK (
  organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  AND created_by_user_id = nullif(current_setting('app.user_id', true), '')::uuid
);
