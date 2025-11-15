#!/usr/bin/env bash
# Build + déploiement du dashboard Next.js (GitHub Pages ou toute commande custom).
#
# Variables optionnelles :
#   DASHBOARD_BUILD_CMD  (par défaut: npm run deploy => build + export statique)
#   DASHBOARD_DEPLOY_CMD (optionnel: commande custom pour publier ./out)

set -euo pipefail

BUILD_CMD="${DASHBOARD_BUILD_CMD:-npm run deploy}"
DEPLOY_CMD="${DASHBOARD_DEPLOY_CMD:-}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "📦 Installation des dépendances"
npm install

echo "⚙️ Build + export dashboard ($BUILD_CMD)"
eval "$BUILD_CMD"

if [[ -n "$DEPLOY_CMD" ]]; then
  echo "🚀 Déploiement ($DEPLOY_CMD)"
  eval "$DEPLOY_CMD"
else
  echo "ℹ️ Aucun déploiement distant configuré (définir DASHBOARD_DEPLOY_CMD si besoin)."
fi

echo "✅ Dashboard mis à jour"

