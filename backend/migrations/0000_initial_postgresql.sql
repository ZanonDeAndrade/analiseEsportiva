CREATE SCHEMA "billing";
--> statement-breakpoint
CREATE SCHEMA "iam";
--> statement-breakpoint
CREATE SCHEMA "model";
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "ops";
--> statement-breakpoint
CREATE SCHEMA "sports";
--> statement-breakpoint
CREATE TYPE "iam"."api_key_status" AS ENUM('active', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "billing"."billing_interval" AS ENUM('month', 'year');--> statement-breakpoint
CREATE TYPE "model"."dataset_status" AS ENUM('building', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "model"."evaluation_kind" AS ENUM('evaluation', 'backtest');--> statement-breakpoint
CREATE TYPE "ops"."export_status" AS ENUM('pending', 'processing', 'available', 'failed', 'expired');--> statement-breakpoint
CREATE TYPE "sports"."fixture_status" AS ENUM('scheduled', 'live', 'finished', 'postponed', 'cancelled', 'unknown');--> statement-breakpoint
CREATE TYPE "iam"."invitation_status" AS ENUM('pending', 'accepted', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "billing"."invoice_status" AS ENUM('draft', 'open', 'paid', 'void', 'uncollectible');--> statement-breakpoint
CREATE TYPE "ops"."job_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "iam"."membership_role" AS ENUM('owner', 'admin', 'analyst', 'viewer');--> statement-breakpoint
CREATE TYPE "iam"."membership_status" AS ENUM('active', 'suspended', 'revoked');--> statement-breakpoint
CREATE TYPE "model"."model_status" AS ENUM('training', 'ready', 'failed', 'retired');--> statement-breakpoint
CREATE TYPE "ops"."operational_scope" AS ENUM('system', 'organization');--> statement-breakpoint
CREATE TYPE "iam"."organization_status" AS ENUM('active', 'suspended', 'closed');--> statement-breakpoint
CREATE TYPE "model"."prediction_status" AS ENUM('pending', 'completed', 'dados_insuficientes', 'failed');--> statement-breakpoint
CREATE TYPE "model"."resource_scope" AS ENUM('system', 'organization');--> statement-breakpoint
CREATE TYPE "model"."segment_status" AS ENUM('available', 'insufficient_data');--> statement-breakpoint
CREATE TYPE "billing"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'paused', 'canceled', 'incomplete');--> statement-breakpoint
CREATE TYPE "iam"."user_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "billing"."webhook_status" AS ENUM('received', 'processing', 'processed', 'failed');--> statement-breakpoint
CREATE TABLE "iam"."api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"secret_hash" text NOT NULL,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "iam"."api_key_status" DEFAULT 'active' NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_keys_key_prefix_uq" UNIQUE("key_prefix"),
	CONSTRAINT "api_keys_name_not_blank_ck" CHECK (length(btrim("iam"."api_keys"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "ops"."audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ops"."audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"scope" "ops"."operational_scope" NOT NULL,
	"organization_id" uuid,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"request_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_scope_organization_ck" CHECK (("ops"."audit_log"."scope" = 'system' and "ops"."audit_log"."organization_id" is null) or ("ops"."audit_log"."scope" = 'organization' and "ops"."audit_log"."organization_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "ops"."background_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "ops"."operational_scope" NOT NULL,
	"organization_id" uuid,
	"queue" text NOT NULL,
	"job_type" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "ops"."job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"requested_by_user_id" uuid,
	"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "background_jobs_queue_idempotency_uq" UNIQUE("queue","idempotency_key"),
	CONSTRAINT "background_jobs_scope_organization_ck" CHECK (("ops"."background_jobs"."scope" = 'system' and "ops"."background_jobs"."organization_id" is null) or ("ops"."background_jobs"."scope" = 'organization' and "ops"."background_jobs"."organization_id" is not null)),
	CONSTRAINT "background_jobs_attempts_ck" CHECK ("ops"."background_jobs"."attempts" >= 0 and "ops"."background_jobs"."max_attempts" > 0 and "ops"."background_jobs"."attempts" <= "ops"."background_jobs"."max_attempts")
);
--> statement-breakpoint
CREATE TABLE "sports"."competitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_provider" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"country_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competitions_source_external_uq" UNIQUE("source_provider","external_id")
);
--> statement-breakpoint
CREATE TABLE "model"."dataset_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_key" text NOT NULL,
	"version" integer NOT NULL,
	"content_sha256" text NOT NULL,
	"status" "model"."dataset_status" NOT NULL,
	"accepted_rows" integer DEFAULT 0 NOT NULL,
	"rejected_rows" integer DEFAULT 0 NOT NULL,
	"duplicate_rows" integer DEFAULT 0 NOT NULL,
	"ambiguous_rows" integer DEFAULT 0 NOT NULL,
	"source_providers" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dataset_versions_key_version_uq" UNIQUE("dataset_key","version"),
	CONSTRAINT "dataset_versions_content_hash_uq" UNIQUE("content_sha256"),
	CONSTRAINT "dataset_versions_hash_ck" CHECK ("model"."dataset_versions"."content_sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "dataset_versions_counts_non_negative_ck" CHECK ("model"."dataset_versions"."accepted_rows" >= 0 and "model"."dataset_versions"."rejected_rows" >= 0 and "model"."dataset_versions"."duplicate_rows" >= 0 and "model"."dataset_versions"."ambiguous_rows" >= 0)
);
--> statement-breakpoint
CREATE TABLE "model"."evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_version_id" uuid NOT NULL,
	"kind" "model"."evaluation_kind" NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"train_rows" integer NOT NULL,
	"test_rows" integer NOT NULL,
	"metrics" jsonb NOT NULL,
	"baselines" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ignored_markets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ethical_notice" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluations_model_kind_generated_uq" UNIQUE("model_version_id","kind","generated_at"),
	CONSTRAINT "evaluations_rows_non_negative_ck" CHECK ("model"."evaluations"."train_rows" >= 0 and "model"."evaluations"."test_rows" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ops"."exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" "ops"."export_status" DEFAULT 'pending' NOT NULL,
	"object_key" text,
	"content_sha256" text,
	"size_bytes" bigint,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exports_available_metadata_ck" CHECK ("ops"."exports"."status" <> 'available' or ("ops"."exports"."object_key" is not null and "ops"."exports"."content_sha256" is not null and "ops"."exports"."size_bytes" is not null))
);
--> statement-breakpoint
CREATE TABLE "sports"."fixtures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_provider" text NOT NULL,
	"external_id" text NOT NULL,
	"competition_id" uuid NOT NULL,
	"season_id" uuid,
	"home_team_id" uuid NOT NULL,
	"away_team_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"status" "sports"."fixture_status" DEFAULT 'unknown' NOT NULL,
	"raw_status" text,
	"round" text,
	"source_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fixtures_source_external_uq" UNIQUE("source_provider","external_id"),
	CONSTRAINT "fixtures_different_teams_ck" CHECK ("sports"."fixtures"."home_team_id" <> "sports"."fixtures"."away_team_id")
);
--> statement-breakpoint
CREATE TABLE "iam"."invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email_normalized" text NOT NULL,
	"role" "iam"."membership_role" NOT NULL,
	"token_hash" text NOT NULL,
	"status" "iam"."invitation_status" DEFAULT 'pending' NOT NULL,
	"invited_by_user_id" uuid NOT NULL,
	"accepted_by_user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_hash_uq" UNIQUE("token_hash"),
	CONSTRAINT "invitations_acceptance_ck" CHECK ("iam"."invitations"."status" <> 'accepted' or ("iam"."invitations"."accepted_by_user_id" is not null and "iam"."invitations"."accepted_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "billing"."invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"subscription_id" uuid,
	"provider" text NOT NULL,
	"provider_invoice_id" text NOT NULL,
	"status" "billing"."invoice_status" NOT NULL,
	"currency" text NOT NULL,
	"amount_due_minor" integer NOT NULL,
	"amount_paid_minor" integer DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_provider_invoice_uq" UNIQUE("provider","provider_invoice_id"),
	CONSTRAINT "invoices_amounts_non_negative_ck" CHECK ("billing"."invoices"."amount_due_minor" >= 0 and "billing"."invoices"."amount_paid_minor" >= 0),
	CONSTRAINT "invoices_currency_ck" CHECK ("billing"."invoices"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "sports"."match_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fixture_id" uuid NOT NULL,
	"source_provider" text NOT NULL,
	"external_id" text NOT NULL,
	"home_goals" integer NOT NULL,
	"away_goals" integer NOT NULL,
	"outcome" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_updated_at" timestamp with time zone,
	CONSTRAINT "match_results_fixture_uq" UNIQUE("fixture_id"),
	CONSTRAINT "match_results_source_external_uq" UNIQUE("source_provider","external_id"),
	CONSTRAINT "match_results_goals_non_negative_ck" CHECK ("sports"."match_results"."home_goals" >= 0 and "sports"."match_results"."away_goals" >= 0),
	CONSTRAINT "match_results_outcome_ck" CHECK ("sports"."match_results"."outcome" in ('H', 'D', 'A'))
);
--> statement-breakpoint
CREATE TABLE "sports"."match_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fixture_id" uuid NOT NULL,
	"source_provider" text NOT NULL,
	"external_id" text NOT NULL,
	"home_corners" integer,
	"away_corners" integer,
	"home_yellow_cards" integer,
	"away_yellow_cards" integer,
	"home_red_cards" integer,
	"away_red_cards" integer,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_stats_fixture_uq" UNIQUE("fixture_id"),
	CONSTRAINT "match_stats_source_external_uq" UNIQUE("source_provider","external_id"),
	CONSTRAINT "match_stats_non_negative_ck" CHECK (coalesce("sports"."match_stats"."home_corners", 0) >= 0 and coalesce("sports"."match_stats"."away_corners", 0) >= 0 and coalesce("sports"."match_stats"."home_yellow_cards", 0) >= 0 and coalesce("sports"."match_stats"."away_yellow_cards", 0) >= 0 and coalesce("sports"."match_stats"."home_red_cards", 0) >= 0 and coalesce("sports"."match_stats"."away_red_cards", 0) >= 0)
);
--> statement-breakpoint
CREATE TABLE "iam"."memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "iam"."membership_role" NOT NULL,
	"status" "iam"."membership_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_organization_user_uq" UNIQUE("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "model"."model_segments" (
	"model_version_id" uuid NOT NULL,
	"market" text NOT NULL,
	"segment_key" text NOT NULL,
	"status" "model"."segment_status" NOT NULL,
	"sample_size" integer NOT NULL,
	"probabilities" jsonb NOT NULL,
	"positive_counts" jsonb NOT NULL,
	"total_counts" jsonb NOT NULL,
	"reason" text,
	CONSTRAINT "model_segments_model_version_id_market_segment_key_pk" PRIMARY KEY("model_version_id","market","segment_key"),
	CONSTRAINT "model_segments_sample_non_negative_ck" CHECK ("model"."model_segments"."sample_size" >= 0)
);
--> statement-breakpoint
CREATE TABLE "model"."model_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_key" text NOT NULL,
	"version" integer NOT NULL,
	"dataset_version_id" uuid NOT NULL,
	"status" "model"."model_status" NOT NULL,
	"min_rows" integer NOT NULL,
	"training_rows" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_sha256" text NOT NULL,
	"trained_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	CONSTRAINT "model_versions_key_version_uq" UNIQUE("model_key","version"),
	CONSTRAINT "model_versions_payload_hash_uq" UNIQUE("payload_sha256"),
	CONSTRAINT "model_versions_counts_ck" CHECK ("model"."model_versions"."min_rows" > 0 and "model"."model_versions"."training_rows" >= 0),
	CONSTRAINT "model_versions_hash_ck" CHECK ("model"."model_versions"."payload_sha256" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "iam"."organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"status" "iam"."organization_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_format_ck" CHECK ("iam"."organizations"."slug" ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
	CONSTRAINT "organizations_name_not_blank_ck" CHECK (length(btrim("iam"."organizations"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "billing"."plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_key" text NOT NULL,
	"name" text NOT NULL,
	"price_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"interval" "billing"."billing_interval" NOT NULL,
	"entitlements" jsonb NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_plan_key_uq" UNIQUE("plan_key"),
	CONSTRAINT "plans_price_non_negative_ck" CHECK ("billing"."plans"."price_minor" >= 0),
	CONSTRAINT "plans_currency_ck" CHECK ("billing"."plans"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "model"."predictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "model"."resource_scope" NOT NULL,
	"organization_id" uuid,
	"fixture_id" uuid NOT NULL,
	"model_version_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "model"."prediction_status" NOT NULL,
	"result" jsonb,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "predictions_idempotency_uq" UNIQUE("idempotency_key"),
	CONSTRAINT "predictions_scope_organization_ck" CHECK (("model"."predictions"."scope" = 'system' and "model"."predictions"."organization_id" is null) or ("model"."predictions"."scope" = 'organization' and "model"."predictions"."organization_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "sports"."seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"source_provider" text NOT NULL,
	"external_id" text NOT NULL,
	"label" text NOT NULL,
	"starts_on" timestamp,
	"ends_on" timestamp,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seasons_source_external_uq" UNIQUE("source_provider","external_id"),
	CONSTRAINT "seasons_date_range_ck" CHECK ("sports"."seasons"."starts_on" is null or "sports"."seasons"."ends_on" is null or "sports"."seasons"."ends_on" >= "sports"."seasons"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "iam"."session_metadata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid,
	"identity_provider" text NOT NULL,
	"provider_session_id" text NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_metadata_provider_session_uq" UNIQUE("identity_provider","provider_session_id")
);
--> statement-breakpoint
CREATE TABLE "billing"."subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_customer_id" text NOT NULL,
	"provider_subscription_id" text NOT NULL,
	"status" "billing"."subscription_status" NOT NULL,
	"current_period_start" timestamp with time zone NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_provider_subscription_uq" UNIQUE("provider","provider_subscription_id"),
	CONSTRAINT "subscriptions_period_ck" CHECK ("billing"."subscriptions"."current_period_end" > "billing"."subscriptions"."current_period_start")
);
--> statement-breakpoint
CREATE TABLE "sports"."team_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"source_provider" text NOT NULL,
	"alias" text NOT NULL,
	"normalized_alias" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_aliases_source_normalized_uq" UNIQUE("source_provider","normalized_alias")
);
--> statement-breakpoint
CREATE TABLE "sports"."teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_provider" text NOT NULL,
	"external_id" text NOT NULL,
	"canonical_name" text NOT NULL,
	"country_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_source_external_uq" UNIQUE("source_provider","external_id")
);
--> statement-breakpoint
CREATE TABLE "billing"."usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"subscription_id" uuid,
	"metric" text NOT NULL,
	"quantity" bigint NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"idempotency_key" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_records_organization_idempotency_uq" UNIQUE("organization_id","idempotency_key"),
	CONSTRAINT "usage_records_quantity_non_negative_ck" CHECK ("billing"."usage_records"."quantity" >= 0),
	CONSTRAINT "usage_records_period_ck" CHECK ("billing"."usage_records"."period_end" > "billing"."usage_records"."period_start")
);
--> statement-breakpoint
CREATE TABLE "iam"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_provider" text NOT NULL,
	"provider_subject" text NOT NULL,
	"email" text,
	"email_normalized" text,
	"display_name" text,
	"status" "iam"."user_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_provider_subject_uq" UNIQUE("identity_provider","provider_subject"),
	CONSTRAINT "users_email_pair_ck" CHECK (("iam"."users"."email" is null and "iam"."users"."email_normalized" is null) or ("iam"."users"."email" is not null and "iam"."users"."email_normalized" is not null))
);
--> statement-breakpoint
CREATE TABLE "billing"."webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"status" "billing"."webhook_status" DEFAULT 'received' NOT NULL,
	"payload_sha256" text NOT NULL,
	"occurred_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"failure_code" text,
	CONSTRAINT "webhook_events_provider_event_uq" UNIQUE("provider","provider_event_id"),
	CONSTRAINT "webhook_events_hash_ck" CHECK ("billing"."webhook_events"."payload_sha256" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "iam"."api_keys" ADD CONSTRAINT "api_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "iam"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam"."api_keys" ADD CONSTRAINT "api_keys_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "iam"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops"."audit_log" ADD CONSTRAINT "audit_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "iam"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops"."audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "iam"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops"."background_jobs" ADD CONSTRAINT "background_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "iam"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops"."background_jobs" ADD CONSTRAINT "background_jobs_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "iam"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model"."evaluations" ADD CONSTRAINT "evaluations_model_version_id_model_versions_id_fk" FOREIGN KEY ("model_version_id") REFERENCES "model"."model_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops"."exports" ADD CONSTRAINT "exports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "iam"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops"."exports" ADD CONSTRAINT "exports_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "iam"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports"."fixtures" ADD CONSTRAINT "fixtures_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "sports"."competitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports"."fixtures" ADD CONSTRAINT "fixtures_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "sports"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports"."fixtures" ADD CONSTRAINT "fixtures_home_team_id_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "sports"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports"."fixtures" ADD CONSTRAINT "fixtures_away_team_id_teams_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "sports"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam"."invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "iam"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam"."invitations" ADD CONSTRAINT "invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "iam"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam"."invitations" ADD CONSTRAINT "invitations_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "iam"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."invoices" ADD CONSTRAINT "invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "iam"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."invoices" ADD CONSTRAINT "invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "billing"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports"."match_results" ADD CONSTRAINT "match_results_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "sports"."fixtures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports"."match_stats" ADD CONSTRAINT "match_stats_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "sports"."fixtures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam"."memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "iam"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam"."memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "iam"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model"."model_segments" ADD CONSTRAINT "model_segments_model_version_id_model_versions_id_fk" FOREIGN KEY ("model_version_id") REFERENCES "model"."model_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model"."model_versions" ADD CONSTRAINT "model_versions_dataset_version_id_dataset_versions_id_fk" FOREIGN KEY ("dataset_version_id") REFERENCES "model"."dataset_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model"."predictions" ADD CONSTRAINT "predictions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "iam"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model"."predictions" ADD CONSTRAINT "predictions_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "sports"."fixtures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model"."predictions" ADD CONSTRAINT "predictions_model_version_id_model_versions_id_fk" FOREIGN KEY ("model_version_id") REFERENCES "model"."model_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports"."seasons" ADD CONSTRAINT "seasons_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "sports"."competitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam"."session_metadata" ADD CONSTRAINT "session_metadata_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "iam"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam"."session_metadata" ADD CONSTRAINT "session_metadata_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "iam"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."subscriptions" ADD CONSTRAINT "subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "iam"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "billing"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports"."team_aliases" ADD CONSTRAINT "team_aliases_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "sports"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."usage_records" ADD CONSTRAINT "usage_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "iam"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."usage_records" ADD CONSTRAINT "usage_records_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "billing"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_organization_status_idx" ON "iam"."api_keys" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "audit_log_organization_created_idx" ON "ops"."audit_log" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_actor_created_idx" ON "ops"."audit_log" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_target_idx" ON "ops"."audit_log" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE INDEX "background_jobs_status_scheduled_idx" ON "ops"."background_jobs" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "background_jobs_organization_created_idx" ON "ops"."background_jobs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "competitions_name_idx" ON "sports"."competitions" USING btree ("name");--> statement-breakpoint
CREATE INDEX "evaluations_kind_generated_idx" ON "model"."evaluations" USING btree ("kind","generated_at");--> statement-breakpoint
CREATE INDEX "exports_organization_created_idx" ON "ops"."exports" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "fixtures_competition_starts_idx" ON "sports"."fixtures" USING btree ("competition_id","starts_at");--> statement-breakpoint
CREATE INDEX "fixtures_season_starts_idx" ON "sports"."fixtures" USING btree ("season_id","starts_at");--> statement-breakpoint
CREATE INDEX "fixtures_home_starts_idx" ON "sports"."fixtures" USING btree ("home_team_id","starts_at");--> statement-breakpoint
CREATE INDEX "fixtures_away_starts_idx" ON "sports"."fixtures" USING btree ("away_team_id","starts_at");--> statement-breakpoint
CREATE INDEX "fixtures_status_starts_idx" ON "sports"."fixtures" USING btree ("status","starts_at");--> statement-breakpoint
CREATE INDEX "invitations_organization_status_idx" ON "iam"."invitations" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "invoices_organization_status_idx" ON "billing"."invoices" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "memberships_user_status_idx" ON "iam"."memberships" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "memberships_organization_status_idx" ON "iam"."memberships" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "model_segments_market_status_idx" ON "model"."model_segments" USING btree ("market","status");--> statement-breakpoint
CREATE INDEX "model_versions_key_status_idx" ON "model"."model_versions" USING btree ("model_key","status");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_uidx" ON "iam"."organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "predictions_fixture_created_idx" ON "model"."predictions" USING btree ("fixture_id","created_at");--> statement-breakpoint
CREATE INDEX "predictions_organization_created_idx" ON "model"."predictions" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "seasons_competition_label_idx" ON "sports"."seasons" USING btree ("competition_id","label");--> statement-breakpoint
CREATE INDEX "session_metadata_user_expires_idx" ON "iam"."session_metadata" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE INDEX "subscriptions_organization_status_idx" ON "billing"."subscriptions" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "team_aliases_team_idx" ON "sports"."team_aliases" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "teams_canonical_name_idx" ON "sports"."teams" USING btree ("canonical_name");--> statement-breakpoint
CREATE INDEX "usage_records_organization_metric_period_idx" ON "billing"."usage_records" USING btree ("organization_id","metric","period_start");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_normalized_uidx" ON "iam"."users" USING btree ("email_normalized") WHERE "iam"."users"."email_normalized" is not null;--> statement-breakpoint
CREATE INDEX "webhook_events_status_received_idx" ON "billing"."webhook_events" USING btree ("status","received_at");
