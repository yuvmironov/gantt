#!/bin/sh
set -eu

PGHOST="${PGHOST:-localhost}"
PGUSER="${PGUSER:-smart_oati}"
PGPASSWORD="${PGPASSWORD:-smart_oati_dev}"
export PGHOST PGUSER PGPASSWORD

for database in smart_oati_project smart_oati_notification smart_oati_audit; do
  psql -v ON_ERROR_STOP=1 -U "$PGUSER" -d postgres -c "CREATE DATABASE $database" 2>/dev/null || true
done

DB_ROOT=db sh infrastructure/local/db-init.sh

assert_count() {
  database="$1"
  query="$2"
  expected="$3"
  actual="$(psql -tA -U "$PGUSER" -d "$database" -c "$query" | tr -d '[:space:]')"
  if [ "$actual" != "$expected" ]; then
    echo "Expected $expected from $database: $query, got $actual"
    exit 1
  fi
}

assert_count smart_oati_user "SELECT count(*) FROM access.roles" 6
assert_count smart_oati_user "SELECT count(*) FROM access.permissions" 26
assert_count smart_oati_user "SELECT count(*) FROM access.role_permissions" 46
assert_count smart_oati_user "SELECT count(*) FROM settings.system_settings" 16
assert_count smart_oati_audit "SELECT count(*) FROM audit.audit_actions" 64
assert_count smart_oati_project "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'project' AND table_name = 'projects'" 1

echo "Database bootstrap checks passed"
