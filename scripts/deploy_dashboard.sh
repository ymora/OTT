#!/usr/bin/env bash
# Build + déploiement du dashboard Next.js (GitHub Pages ou toute commande custom).
#
# Variables optionnelles :
#   DASHBOARD_BUILD_CMD  (par défaut: npm run build)
#   DASHBOARD_DEPLOY_CMD (par défaut: npm run deploy)

set -euo pipefail

BUILD_CMD="${DASHBOARD_BUILD_CMD:-npm run build}"
DEPLOY_CMD="${DASHBOARD_DEPLOY_CMD:-npm run deploy}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "📦 Installation des dépendances"
npm install

echo "⚙️ Build dashboard ($BUILD_CMD)"
eval "$BUILD_CMD"

echo "🚀 Déploiement ($DEPLOY_CMD)"
eval "$DEPLOY_CMD"

echo "✅ Dashboard mis à jour"

