#!/usr/bin/env bash
# ============================================================================
# Script wrapper pour démarrer l'API avec migration automatique
# ============================================================================
# Utilisé par Render pour initialiser la DB avant de démarrer Apache
# ============================================================================

set -euo pipefail

# Exécuter l'initialisation de la base de données
if [ -f "/var/www/html/scripts/db/init_database.sh" ]; then
    bash /var/www/html/scripts/db/init_database.sh || true
elif [ -f "scripts/db/init_database.sh" ]; then
    bash scripts/db/init_database.sh || true
fi

# Démarrer Apache (serveur web sur port 80)
exec apache2-foreground

