#!/bin/sh
set -eu

: "${PGHOST:?PGHOST is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"
: "${SOURCE_DATABASE:?SOURCE_DATABASE is required}"
: "${RESTORE_DATABASE:?RESTORE_DATABASE is required}"

if [ "${RESTORE_DRILL_CONFIRM:-}" != "local-development-only" ]; then
  echo "Restore drill confirmation is missing." >&2
  exit 2
fi
if [ "$SOURCE_DATABASE" = "$RESTORE_DATABASE" ]; then
  echo "Source and restore databases must be different." >&2
  exit 2
fi
case "$RESTORE_DATABASE" in
  betintel_restore*) ;;
  *) echo "Restore database must start with betintel_restore." >&2; exit 2 ;;
esac

dump_file="$(mktemp /tmp/betintel-restore-drill.XXXXXX)"
trap 'rm -f "$dump_file"' EXIT INT TERM

echo "Creating ephemeral logical backup for restore drill."
pg_dump --format=custom --no-owner --no-privileges --dbname="$SOURCE_DATABASE" --file="$dump_file"

dropdb --if-exists --force "$RESTORE_DATABASE"
createdb --template=template0 "$RESTORE_DATABASE"
pg_restore --exit-on-error --no-owner --no-privileges --dbname="$RESTORE_DATABASE" "$dump_file"

fingerprint_sql="
SELECT jsonb_build_object(
  'schemas', (SELECT count(*) FROM information_schema.schemata WHERE schema_name IN ('sports','model','iam','private','billing','ops')),
  'migrations', (SELECT count(*) FROM ops.schema_migrations),
  'fixtures', (SELECT count(*) FROM sports.fixtures),
  'organizations', (SELECT count(*) FROM iam.organizations),
  'models', (SELECT count(*) FROM model.model_versions),
  'jobs', (SELECT count(*) FROM ops.background_jobs)
)::text;
"
source_fingerprint="$(psql --quiet --tuples-only --no-align --dbname="$SOURCE_DATABASE" --command="$fingerprint_sql")"
restore_fingerprint="$(psql --quiet --tuples-only --no-align --dbname="$RESTORE_DATABASE" --command="$fingerprint_sql")"

if [ "$source_fingerprint" != "$restore_fingerprint" ]; then
  echo "Restore drill fingerprint mismatch." >&2
  exit 1
fi

echo "Restore drill passed: schema, migrations and critical row counts match."
