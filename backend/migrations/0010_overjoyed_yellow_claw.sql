CREATE TYPE "sports"."alias_review_status" AS ENUM('auto_accepted', 'pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "sports"."data_quality_status" AS ENUM('open', 'resolved', 'rejected');--> statement-breakpoint
ALTER TYPE "sports"."fixture_status" ADD VALUE 'not_started' BEFORE 'live';--> statement-breakpoint
ALTER TYPE "sports"."fixture_status" ADD VALUE 'halftime' BEFORE 'finished';--> statement-breakpoint
ALTER TYPE "sports"."fixture_status" ADD VALUE 'abandoned' BEFORE 'unknown';--> statement-breakpoint
ALTER TYPE "sports"."fixture_status" ADD VALUE 'extra_time' BEFORE 'unknown';--> statement-breakpoint
ALTER TYPE "sports"."fixture_status" ADD VALUE 'penalties' BEFORE 'unknown';--> statement-breakpoint
CREATE TABLE "sports"."competition_external_ids" (
	"competition_id" uuid NOT NULL,
	"source_provider" text NOT NULL,
	"external_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competition_external_ids_source_provider_external_id_pk" PRIMARY KEY("source_provider","external_id")
);
--> statement-breakpoint
CREATE TABLE "sports"."data_quality_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_version_id" uuid,
	"issue_type" text NOT NULL,
	"source_provider" text NOT NULL,
	"external_id" text,
	"message" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "sports"."data_quality_status" DEFAULT 'open' NOT NULL,
	"resolution" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "model"."dataset_records" (
	"dataset_version_id" uuid NOT NULL,
	"fixture_id" uuid NOT NULL,
	"result_revision_id" uuid,
	"source_provider" text NOT NULL,
	"external_id" text NOT NULL,
	"record_sha256" text NOT NULL,
	"record_payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dataset_records_dataset_version_id_source_provider_external_id_pk" PRIMARY KEY("dataset_version_id","source_provider","external_id")
);
--> statement-breakpoint
CREATE TABLE "sports"."match_result_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fixture_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"source_provider" text NOT NULL,
	"record_sha256" text NOT NULL,
	"home_goals" integer NOT NULL,
	"away_goals" integer NOT NULL,
	"outcome" text NOT NULL,
	"decision" text NOT NULL,
	"winner" text NOT NULL,
	"home_extra_time_goals" integer,
	"away_extra_time_goals" integer,
	"home_penalty_goals" integer,
	"away_penalty_goals" integer,
	"source_updated_at" timestamp with time zone,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_result_revisions_fixture_revision_uq" UNIQUE("fixture_id","revision"),
	CONSTRAINT "match_result_revisions_fixture_hash_uq" UNIQUE("fixture_id","record_sha256")
);
--> statement-breakpoint
CREATE TABLE "sports"."provider_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_version_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"policy_reference" text NOT NULL,
	"license_reference" text NOT NULL,
	"content_sha256" text NOT NULL,
	"record_count" integer NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_snapshots_dataset_provider_uq" UNIQUE("dataset_version_id","provider")
);
--> statement-breakpoint
CREATE TABLE "sports"."season_external_ids" (
	"season_id" uuid NOT NULL,
	"source_provider" text NOT NULL,
	"external_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "season_external_ids_source_provider_external_id_pk" PRIMARY KEY("source_provider","external_id")
);
--> statement-breakpoint
ALTER TABLE "sports"."competitions" ADD COLUMN "canonical_key" text;--> statement-breakpoint
ALTER TABLE "sports"."fixtures" ADD COLUMN "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "sports"."fixtures" ADD COLUMN "fresh_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sports"."match_results" ADD COLUMN "decision" text DEFAULT 'regulation' NOT NULL;--> statement-breakpoint
ALTER TABLE "sports"."match_results" ADD COLUMN "winner" text DEFAULT 'draw' NOT NULL;--> statement-breakpoint
ALTER TABLE "sports"."match_results" ADD COLUMN "home_extra_time_goals" integer;--> statement-breakpoint
ALTER TABLE "sports"."match_results" ADD COLUMN "away_extra_time_goals" integer;--> statement-breakpoint
ALTER TABLE "sports"."match_results" ADD COLUMN "home_penalty_goals" integer;--> statement-breakpoint
ALTER TABLE "sports"."match_results" ADD COLUMN "away_penalty_goals" integer;--> statement-breakpoint
ALTER TABLE "sports"."match_results" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "sports"."seasons" ADD COLUMN "canonical_key" text;--> statement-breakpoint
ALTER TABLE "sports"."team_aliases" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "sports"."team_aliases" ADD COLUMN "review_status" "sports"."alias_review_status" DEFAULT 'auto_accepted' NOT NULL;--> statement-breakpoint
ALTER TABLE "sports"."team_aliases" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sports"."teams" ADD COLUMN "canonical_key" text;--> statement-breakpoint
WITH ranked AS (
  SELECT id,
         lower(trim(both '-' from regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))) AS base_key,
         row_number() OVER (PARTITION BY lower(trim(both '-' from regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))) ORDER BY created_at, id) AS position
  FROM sports.competitions
)
UPDATE sports.competitions AS target
SET canonical_key = ranked.base_key || CASE WHEN ranked.position = 1 THEN '' ELSE '-legacy-' || target.id::text END
FROM ranked WHERE ranked.id = target.id;--> statement-breakpoint
WITH ranked AS (
  SELECT seasons.id,
         competitions.canonical_key || ':' || lower(trim(both '-' from regexp_replace(seasons.label, '[^a-zA-Z0-9]+', '-', 'g'))) AS base_key,
         row_number() OVER (PARTITION BY competitions.canonical_key, lower(trim(both '-' from regexp_replace(seasons.label, '[^a-zA-Z0-9]+', '-', 'g'))) ORDER BY seasons.created_at, seasons.id) AS position
  FROM sports.seasons JOIN sports.competitions ON competitions.id = seasons.competition_id
)
UPDATE sports.seasons AS target
SET canonical_key = ranked.base_key || CASE WHEN ranked.position = 1 THEN '' ELSE '-legacy-' || target.id::text END
FROM ranked WHERE ranked.id = target.id;--> statement-breakpoint
WITH ranked AS (
  SELECT id,
         lower(trim(both '-' from regexp_replace(canonical_name, '[^a-zA-Z0-9]+', '-', 'g'))) AS base_key,
         row_number() OVER (PARTITION BY lower(trim(both '-' from regexp_replace(canonical_name, '[^a-zA-Z0-9]+', '-', 'g'))) ORDER BY created_at, id) AS position
  FROM sports.teams
)
UPDATE sports.teams AS target
SET canonical_key = ranked.base_key || CASE WHEN ranked.position = 1 THEN '' ELSE '-legacy-' || target.id::text END
FROM ranked WHERE ranked.id = target.id;--> statement-breakpoint
UPDATE sports.team_aliases SET external_id = normalized_alias WHERE external_id IS NULL;--> statement-breakpoint
UPDATE sports.fixtures
SET fresh_until = COALESCE(source_updated_at, updated_at, now()) + interval '6 hours'
WHERE fresh_until IS NULL;--> statement-breakpoint
ALTER TABLE sports.competitions ALTER COLUMN canonical_key SET NOT NULL;--> statement-breakpoint
ALTER TABLE sports.seasons ALTER COLUMN canonical_key SET NOT NULL;--> statement-breakpoint
ALTER TABLE sports.teams ALTER COLUMN canonical_key SET NOT NULL;--> statement-breakpoint
ALTER TABLE sports.team_aliases ALTER COLUMN external_id SET NOT NULL;--> statement-breakpoint
ALTER TABLE sports.fixtures ALTER COLUMN fresh_until SET NOT NULL;--> statement-breakpoint
INSERT INTO sports.competition_external_ids (competition_id, source_provider, external_id)
SELECT id, source_provider, external_id FROM sports.competitions ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO sports.season_external_ids (season_id, source_provider, external_id)
SELECT id, source_provider, external_id FROM sports.seasons ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO sports.match_result_revisions (
  fixture_id, revision, source_provider, record_sha256, home_goals, away_goals,
  outcome, decision, winner, source_updated_at, recorded_at
)
SELECT fixture_id, 1, source_provider,
       md5(fixture_id::text || ':' || home_goals::text || ':' || away_goals::text) || md5(external_id || ':v1'),
       home_goals, away_goals, outcome, 'regulation',
       CASE outcome WHEN 'H' THEN 'home' WHEN 'A' THEN 'away' ELSE 'draw' END,
       source_updated_at, recorded_at
FROM sports.match_results ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO sports.data_quality_issues (dataset_version_id, issue_type, source_provider, message, payload)
SELECT id, 'legacy_dataset_without_record_manifest', 'legacy-migration',
       'Dataset anterior à migração 0010 não possui manifesto exato por registro.',
       jsonb_build_object('datasetKey', dataset_key, 'version', version)
FROM model.dataset_versions;--> statement-breakpoint
ALTER TABLE "sports"."competition_external_ids" ADD CONSTRAINT "competition_external_ids_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "sports"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports"."data_quality_issues" ADD CONSTRAINT "data_quality_issues_dataset_version_id_dataset_versions_id_fk" FOREIGN KEY ("dataset_version_id") REFERENCES "model"."dataset_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model"."dataset_records" ADD CONSTRAINT "dataset_records_dataset_version_id_dataset_versions_id_fk" FOREIGN KEY ("dataset_version_id") REFERENCES "model"."dataset_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model"."dataset_records" ADD CONSTRAINT "dataset_records_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "sports"."fixtures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model"."dataset_records" ADD CONSTRAINT "dataset_records_result_revision_id_match_result_revisions_id_fk" FOREIGN KEY ("result_revision_id") REFERENCES "sports"."match_result_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports"."match_result_revisions" ADD CONSTRAINT "match_result_revisions_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "sports"."fixtures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports"."provider_snapshots" ADD CONSTRAINT "provider_snapshots_dataset_version_id_dataset_versions_id_fk" FOREIGN KEY ("dataset_version_id") REFERENCES "model"."dataset_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports"."season_external_ids" ADD CONSTRAINT "season_external_ids_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "sports"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "competition_external_ids_competition_idx" ON "sports"."competition_external_ids" USING btree ("competition_id");--> statement-breakpoint
CREATE INDEX "data_quality_issues_status_created_idx" ON "sports"."data_quality_issues" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "data_quality_issues_provider_external_idx" ON "sports"."data_quality_issues" USING btree ("source_provider","external_id");--> statement-breakpoint
CREATE INDEX "dataset_records_fixture_idx" ON "model"."dataset_records" USING btree ("fixture_id");--> statement-breakpoint
CREATE INDEX "match_result_revisions_fixture_idx" ON "sports"."match_result_revisions" USING btree ("fixture_id","recorded_at");--> statement-breakpoint
CREATE INDEX "season_external_ids_season_idx" ON "sports"."season_external_ids" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "fixtures_fresh_until_idx" ON "sports"."fixtures" USING btree ("fresh_until");--> statement-breakpoint
ALTER TABLE "sports"."competitions" ADD CONSTRAINT "competitions_canonical_key_uq" UNIQUE("canonical_key");--> statement-breakpoint
ALTER TABLE "sports"."seasons" ADD CONSTRAINT "seasons_canonical_key_uq" UNIQUE("canonical_key");--> statement-breakpoint
ALTER TABLE "sports"."team_aliases" ADD CONSTRAINT "team_aliases_source_external_uq" UNIQUE("source_provider","external_id");--> statement-breakpoint
ALTER TABLE "sports"."teams" ADD CONSTRAINT "teams_canonical_key_uq" UNIQUE("canonical_key");--> statement-breakpoint
ALTER TABLE "sports"."match_results" ADD CONSTRAINT "match_results_decision_ck" CHECK ("sports"."match_results"."decision" in ('regulation', 'extra_time', 'penalties', 'administrative'));--> statement-breakpoint
ALTER TABLE "sports"."match_results" ADD CONSTRAINT "match_results_winner_ck" CHECK ("sports"."match_results"."winner" in ('home', 'away', 'draw', 'undetermined'));
