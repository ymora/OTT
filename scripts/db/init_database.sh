#!/usr/bin/env bash
# ============================================================================
# Script d'initialisation automatique de la base de données
# ============================================================================
# Vérifie si la base est initialisée et applique sql/schema.sql si nécessaire
# Utilisé pour automatiser les migrations sur Render
# ============================================================================

set -euo pipefail

# Couleurs pour les messages
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🔍 Vérification de la base de données...${NC}"

# Récupérer les variables d'environnement
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-ott_data}"
DB_USER="${DB_USER:-postgres}"
DB_PASS="${DB_PASS:-}"

# Utiliser DATABASE_URL si disponible (priorité)
if [ -n "${DATABASE_URL:-}" ]; then
    # Parser DATABASE_URL (format: postgresql://user:pass@host:port/dbname)
    DB_CONNECTION="$DATABASE_URL"
else
    # Construire la connection string
    if [ -n "$DB_PASS" ]; then
        DB_CONNECTION="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
    else
        DB_CONNECTION="postgresql://${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
    fi
fi

# Vérifier si psql est disponible
if ! command -v psql &> /dev/null; then
    echo -e "${YELLOW}⚠️  psql n'est pas disponible, migration automatique désactivée${NC}"
    echo -e "${YELLOW}   La base de données doit être initialisée manuellement${NC}"
    exit 0
fi

# Vérifier si la table 'users' existe (table clé du schéma)
TABLE_EXISTS=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users');" 2>/dev/null || echo "false")

if [ "$TABLE_EXISTS" = "t" ] || [ "$TABLE_EXISTS" = "true" ]; then
    echo -e "${GREEN}✅ Base de données déjà initialisée (table 'users' existe)${NC}"
    echo -e "${GREEN}   Aucune migration nécessaire${NC}"
    exit 0
fi

# La table n'existe pas, appliquer le schéma
echo -e "${YELLOW}📦 Base de données non initialisée, application du schéma...${NC}"

SCHEMA_FILE="/var/www/html/sql/schema.sql"
if [ ! -f "$SCHEMA_FILE" ]; then
    # Essayer avec le chemin relatif (développement local)
    SCHEMA_FILE="$(dirname "$0")/../../sql/schema.sql"
    if [ ! -f "$SCHEMA_FILE" ]; then
        echo -e "${RED}❌ Erreur: sql/schema.sql introuvable${NC}"
        exit 1
    fi
fi

echo -e "${YELLOW}   Exécution de $SCHEMA_FILE...${NC}"

# Appliquer le schéma
if PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$SCHEMA_FILE" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Schéma appliqué avec succès !${NC}"
    exit 0
else
    echo -e "${RED}❌ Erreur lors de l'application du schéma${NC}"
    echo -e "${YELLOW}   La base de données doit être initialisée manuellement${NC}"
    # Ne pas faire échouer le démarrage si la migration échoue
    exit 0
fi

