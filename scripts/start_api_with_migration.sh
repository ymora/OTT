#!/usr/bin/env bash
# ============================================================================
# Script wrapper pour démarrer l'API avec migration automatique
# ============================================================================
# Utilisé par Render pour initialiser la DB avant de démarrer PHP
# ============================================================================

set -euo pipefail

# Exécuter l'initialisation de la base de données
if [ -f "/var/www/html/scripts/db/init_database.sh" ]; then
    bash /var/www/html/scripts/db/init_database.sh || true
elif [ -f "scripts/db/init_database.sh" ]; then
    bash scripts/db/init_database.sh || true
fi

# Démarrer le serveur PHP (commande originale de Render)
exec php -S 0.0.0.0:8000 -t .

