#!/usr/bin/env bash
# Helper to apply sql/schema.sql (and optionally sql/demo_seed.sql) against the target Postgres DB.
#
# Usage:
#   DATABASE_URL=postgresql://... ./scripts/db_migrate.sh --seed
#   # ou, sans URL complète :
#   DB_HOST=localhost DB_PORT=5432 DB_USER=postgres DB_PASS=postgres DB_NAME=ott_data ./scripts/db_migrate.sh
#
# Environment variables:
#   DATABASE_URL  : URL complète PostgreSQL (prioritaire si définie)
#   DB_HOST       : hôte Postgres (défaut: localhost)
#   DB_PORT       : port Postgres (défaut: 5432)
#   DB_USER       : utilisateur Postgres (défaut: postgres)
#   DB_PASS       : mot de passe Postgres (obligatoire si pas de DATABASE_URL)
#   DB_NAME       : base de données cible (défaut: ott_data)
#
# Arguments:
#   --seed        : exécute également sql/demo_seed.sql

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCHEMA_FILE="$ROOT_DIR/sql/schema.sql"
SEED_FILE="$ROOT_DIR/sql/demo_seed.sql"

RUN_SEED=false
if [[ "${1:-}" == "--seed" ]]; then
  RUN_SEED=true
fi

if [[ ! -f "$SCHEMA_FILE" ]]; then
  echo "❌ sql/schema.sql introuvable ($SCHEMA_FILE)" >&2
  exit 1
fi

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"
DB_PASS="${DB_PASS:-postgres}"
DB_NAME="${DB_NAME:-ott_data}"

echo "📦 Application de $SCHEMA_FILE (PostgreSQL)"

run_psql() {
  if [[ -n "${DATABASE_URL:-}" ]]; then
    psql "$DATABASE_URL" "$@"
  else
    : "${DB_PASS:?Définir DB_PASS ou DATABASE_URL}"
    PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" "$@"
  fi
}

run_psql -f "$SCHEMA_FILE"

if $RUN_SEED; then
  echo "🌱 Injection des données de démo ($SEED_FILE)"
  run_psql -f "$SEED_FILE"
fi

echo "✅ Migration terminée"

