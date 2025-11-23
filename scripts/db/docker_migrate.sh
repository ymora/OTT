#!/usr/bin/env bash
# ============================================================================
# Script de migration de la base de données existante avec Docker
# ============================================================================
# Applique UNIQUEMENT migration_optimisations.sql sur une base existante
# Ne crée pas de nouvelle base, ne réinitialise rien
# ============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION_FILE="$ROOT_DIR/sql/migration_optimisations.sql"

# Variables de connexion (par défaut Docker)
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-ott_data}"
DB_USER="${DB_USER:-postgres}"
DB_PASS="${DB_PASS:-postgres}"

echo "🔧 Migration de la base de données OTT existante"
echo "   Host: $DB_HOST:$DB_PORT"
echo "   Database: $DB_NAME"
echo "   User: $DB_USER"
echo ""

# Vérifier que PostgreSQL est accessible
echo "⏳ Vérification de la connexion PostgreSQL..."
if ! PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c '\q' 2>/dev/null; then
  echo "❌ Impossible de se connecter à la base de données" >&2
  echo "   Vérifiez que Docker est démarré: docker compose up -d db" >&2
  exit 1
fi
echo "✅ Connexion établie"
echo ""

# Vérifier que la base existe et contient des données
echo "🔍 Vérification de la base de données..."
TABLE_COUNT=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'" 2>/dev/null | tr -d ' ')

if [[ -z "$TABLE_COUNT" ]] || [[ "$TABLE_COUNT" == "0" ]]; then
  echo "⚠️  La base de données semble vide ou n'existe pas"
  echo "   Utilisez scripts/docker_init_db.sh pour une initialisation complète"
  exit 1
fi

echo "   Tables existantes: $TABLE_COUNT"
echo ""

# Vérifier si la migration a déjà été appliquée
echo "🔍 Vérification de l'état de la migration..."
MIGRATION_APPLIED=false

# Vérifier si les nouvelles tables existent
NEW_TABLES=("user_sessions" "device_firmware_history" "system_settings")
for table in "${NEW_TABLES[@]}"; do
  EXISTS=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c \
    "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '$table')" 2>/dev/null | tr -d ' ')
  if [[ "$EXISTS" == "t" ]]; then
    echo "   ✅ Table '$table' existe déjà"
    MIGRATION_APPLIED=true
  fi
done

if [[ "$MIGRATION_APPLIED" == "true" ]]; then
  echo ""
  read -p "⚠️  Des tables de migration existent déjà. Voulez-vous quand même réappliquer la migration ? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Migration annulée"
    exit 0
  fi
  echo ""
fi

# Appliquer la migration
if [[ ! -f "$MIGRATION_FILE" ]]; then
  echo "❌ Fichier migration_optimisations.sql introuvable ($MIGRATION_FILE)" >&2
  exit 1
fi

echo "📋 Application de la migration d'optimisations..."
echo "   Fichier: $MIGRATION_FILE"
echo ""

PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$MIGRATION_FILE"

if [[ $? -eq 0 ]]; then
  echo ""
  echo "✅ Migration appliquée avec succès !"
  echo ""
  
  # Vérifications finales
  echo "🔍 Vérifications post-migration..."
  NEW_TABLES=("user_sessions" "device_firmware_history" "system_settings" "device_events" "reports" "teams" "tags")
  for table in "${NEW_TABLES[@]}"; do
    EXISTS=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c \
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '$table')" 2>/dev/null | tr -d ' ')
    if [[ "$EXISTS" == "t" ]]; then
      echo "   ✅ Table '$table' créée"
    else
      echo "   ⚠️  Table '$table' manquante"
    fi
  done
  
  echo ""
  echo "✅ Migration terminée !"
else
  echo ""
  echo "❌ Erreur lors de l'application de la migration"
  exit 1
fi

