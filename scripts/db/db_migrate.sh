#!/usr/bin/env bash
# Helper to apply sql/schema.sql and sql/migration_optimisations.sql against the target Postgres DB.
#
# Usage:
#   DATABASE_URL=postgresql://... ./scripts/db_migrate.sh
#
# Environment variables:
#   DATABASE_URL  : URL complète PostgreSQL (obligatoire - base Render)
#
# ATTENTION: Une seule base de données est utilisée (celle de Render en production)
# Ce script applique sql/schema.sql puis sql/migration_optimisations.sql

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCHEMA_FILE="$ROOT_DIR/sql/schema.sql"
MIGRATION_FILE="$ROOT_DIR/sql/migration_optimisations.sql"

if [[ ! -f "$SCHEMA_FILE" ]]; then
  echo "❌ Fichier SQL introuvable ($SCHEMA_FILE)" >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "❌ DATABASE_URL doit être défini (base Render)" >&2
  echo "   Exemple: DATABASE_URL=postgresql://user:pass@host:port/db ./scripts/db_migrate.sh" >&2
  exit 1
fi

echo "📦 Application du schéma et des optimisations (PostgreSQL)"
echo "   Base: $DATABASE_URL"
echo ""

echo "1️⃣  Application du schéma initial..."
psql "$DATABASE_URL" -f "$SCHEMA_FILE"

if [[ -f "$MIGRATION_FILE" ]]; then
  echo ""
  echo "2️⃣  Application des optimisations..."
  psql "$DATABASE_URL" -f "$MIGRATION_FILE"
else
  echo ""
  echo "⚠️  Fichier migration_optimisations.sql introuvable, ignoré"
fi

echo ""
echo "✅ Migration terminée"

