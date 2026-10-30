#!/bin/sh
set -eu

USER_DB="${USER_DB:-smart_oati_user}"
PROJECT_DB="${PROJECT_DB:-smart_oati_project}"
NOTIFICATION_DB="${NOTIFICATION_DB:-smart_oati_notification}"
AUDIT_DB="${AUDIT_DB:-smart_oati_audit}"
DB_ROOT="${DB_ROOT:-/db}"
PGHOST="${PGHOST:-postgres}"
PGUSER="${PGUSER:-smart_oati}"
export PGPASSWORD="${PGPASSWORD:-smart_oati_dev}"

apply_migration() {
  database="$1"
  file="$2"
  echo "Applying $file to $database"
  sed '/-- Down Migration/,$d' "$file" | psql -v ON_ERROR_STOP=1 -h "$PGHOST" -U "$PGUSER" -d "$database"
}

apply_seed() {
  database="$1"
  file="$2"
  echo "Seeding $file into $database"
  psql -v ON_ERROR_STOP=1 -h "$PGHOST" -U "$PGUSER" -d "$database" -f "$file"
}

apply_migration "$USER_DB" "$DB_ROOT/migrations/user_access/0001_user_access.sql"
apply_seed "$USER_DB" "$DB_ROOT/seeds/user_access/001_roles_permissions.sql"
apply_seed "$USER_DB" "$DB_ROOT/seeds/user_access/002_system_settings.sql"

apply_migration "$PROJECT_DB" "$DB_ROOT/migrations/project_diagram/0002_project_diagram.sql"
apply_migration "$NOTIFICATION_DB" "$DB_ROOT/migrations/notification/0003_notification.sql"
apply_migration "$AUDIT_DB" "$DB_ROOT/migrations/audit/0004_audit.sql"
apply_seed "$AUDIT_DB" "$DB_ROOT/seeds/audit/003_audit_actions.sql"
