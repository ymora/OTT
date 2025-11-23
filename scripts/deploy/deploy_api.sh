#!/usr/bin/env bash
# Déploiement simplifié de l'API PHP sur Render (ou tout remote git).
# Assure-toi d'avoir configuré un remote nommé "render" (git remote add render ...).

set -euo pipefail

REMOTE="${RENDER_REMOTE:-render}"
BRANCH="${RENDER_BRANCH:-main}"

echo "🚀 Push API vers $REMOTE/$BRANCH"
git push "$REMOTE" "$BRANCH"

cat <<'EOF'

Suivi du déploiement :
  render dashboard: https://dashboard.render.com/
  logs temps réel : render logs <service-name>

EOF

