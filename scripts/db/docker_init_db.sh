#!/usr/bin/env bash
# ============================================================================
# Script d'initialisation de la base de données avec Docker
# ============================================================================
# Applique schema.sql puis migration_optimisations.sql
# ============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCHEMA_FILE="$ROOT_DIR/sql/schema.sql"
MIGRATION_FILE="$ROOT_DIR/sql/migration_optimisations.sql"

# Variables de connexion
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-ott_data}"
DB_USER="${DB_USER:-postgres}"
DB_PASS="${DB_PASS:-postgres}"

echo "🚀 Initialisation de la base de données OTT"
echo "   Host: $DB_HOST:$DB_PORT"
echo "   Database: $DB_NAME"
echo "   User: $DB_USER"
echo ""

# Attendre que PostgreSQL soit prêt
echo "⏳ Attente de PostgreSQL..."
until PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "postgres" -c '\q' 2>/dev/null; do
  echo "   PostgreSQL n'est pas encore prêt, attente..."
  sleep 2
done
echo "✅ PostgreSQL est prêt"
echo ""

# Vérifier si la base existe déjà
echo "📦 Vérification de la base de données..."
DB_EXISTS=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "postgres" -tc \
  "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" 2>/dev/null | tr -d ' ')

if [[ -z "$DB_EXISTS" ]]; then
  echo "   Création de la base de données..."
  PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "postgres" -c \
    "CREATE DATABASE $DB_NAME" 2>/dev/null
  echo "✅ Base de données créée"
else
  echo "✅ Base de données existe déjà"
  
  # Vérifier si elle contient des données
  TABLE_COUNT=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'" 2>/dev/null | tr -d ' ')
  
  if [[ -n "$TABLE_COUNT" ]] && [[ "$TABLE_COUNT" != "0" ]]; then
    echo "   ⚠️  La base contient déjà $TABLE_COUNT table(s)"
    echo "   💡 Utilisez scripts/docker_migrate.sh pour mettre à jour une base existante"
    echo ""
    read -p "   Voulez-vous quand même réinitialiser la base ? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      echo "❌ Initialisation annulée"
      exit 0
    fi
    echo ""
  fi
fi
echo ""

# Appliquer le schéma initial
if [[ -f "$SCHEMA_FILE" ]]; then
  echo "📋 Application du schéma initial ($SCHEMA_FILE)..."
  PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$SCHEMA_FILE"
  echo "✅ Schéma initial appliqué"
  echo ""
else
  echo "⚠️  Fichier schema.sql introuvable, passage à la migration..."
  echo ""
fi

# Appliquer la migration d'optimisations
if [[ -f "$MIGRATION_FILE" ]]; then
  echo "🔧 Application de la migration d'optimisations ($MIGRATION_FILE)..."
  PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$MIGRATION_FILE"
  echo "✅ Migration d'optimisations appliquée"
  echo ""
else
  echo "⚠️  Fichier migration_optimisations.sql introuvable"
  echo ""
fi

# Vérifications
echo "🔍 Vérifications..."
echo ""

# Compter les tables
TABLE_COUNT=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'")
echo "   Tables: $TABLE_COUNT"

# Vérifier les nouvelles tables importantes
NEW_TABLES=("user_sessions" "device_firmware_history" "system_settings" "device_events" "reports" "teams" "tags")
for table in "${NEW_TABLES[@]}"; do
  EXISTS=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c \
    "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '$table')" | tr -d ' ')
  if [[ "$EXISTS" == "t" ]]; then
    echo "   ✅ Table '$table' existe"
  else
    echo "   ⚠️  Table '$table' manquante"
  fi
done

echo ""
echo "✅ Initialisation terminée !"
echo ""
echo "📊 Accès à la base de données :"
echo "   - Host: $DB_HOST"
echo "   - Port: $DB_PORT"
echo "   - Database: $DB_NAME"
echo "   - User: $DB_USER"
echo ""
echo "🌐 Visualiseur web (si pgweb est lancé) : http://localhost:8081"
echo ""

