#!/usr/bin/env bash
# Helper to apply schema.sql (and optionally demo_seed.sql) against the target DB.
#
# Usage:
#   DB_TYPE=postgres DATABASE_URL=... ./scripts/db_migrate.sh
#   DB_TYPE=mysql DB_HOST=... DB_USER=... DB_PASS=... DB_NAME=... ./scripts/db_migrate.sh --seed
#
# Environment variables:
#   DB_TYPE       : postgres (par défaut) ou mysql
#   DATABASE_URL  : URL complète Render/Heroku (pour Postgres)
#   DB_HOST/DB_USER/DB_PASS/DB_NAME : requis si DB_TYPE=mysql
#
# Arguments:
#   --seed        : exécute également sql/demo_seed.sql

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCHEMA_FILE="$ROOT_DIR/schema.sql"
SEED_FILE="$ROOT_DIR/sql/demo_seed.sql"

RUN_SEED=false
if [[ "${1:-}" == "--seed" ]]; then
  RUN_SEED=true
fi

DB_TYPE="${DB_TYPE:-postgres}"

if [[ ! -f "$SCHEMA_FILE" ]]; then
  echo "❌ schema.sql introuvable ($SCHEMA_FILE)" >&2
  exit 1
fi

echo "📦 Application de $SCHEMA_FILE (DB_TYPE=$DB_TYPE)"

if [[ "$DB_TYPE" == "postgres" ]]; then
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "❌ Veuillez définir DATABASE_URL pour Postgres (ex: export DATABASE_URL=...)" >&2
    exit 1
  fi
  psql "$DATABASE_URL" -f "$SCHEMA_FILE"
  if $RUN_SEED; then
    echo "🌱 Injection des données de démo ($SEED_FILE)"
    psql "$DATABASE_URL" -f "$SEED_FILE"
  fi
elif [[ "$DB_TYPE" == "mysql" ]]; then
  : "${DB_HOST:?Définir DB_HOST}"
  : "${DB_USER:?Définir DB_USER}"
  : "${DB_PASS:?Définir DB_PASS}"
  : "${DB_NAME:?Définir DB_NAME}"
  mysql -h "$DB_HOST" -u "$DB_USER" "-p${DB_PASS}" "$DB_NAME" < "$SCHEMA_FILE"
  if $RUN_SEED; then
    echo "🌱 Injection des données de démo ($SEED_FILE)"
    mysql -h "$DB_HOST" -u "$DB_USER" "-p${DB_PASS}" "$DB_NAME" < "$SEED_FILE"
  fi
else
  echo "❌ DB_TYPE non supporté: $DB_TYPE" >&2
  exit 1
fi

echo "✅ Migration terminée"

