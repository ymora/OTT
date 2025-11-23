#!/usr/bin/env bash
# Script de vérification du build pour éviter les problèmes de routing
# Usage: ./scripts/deploy/verify-build.sh

set -euo pipefail

OUT_DIR="${1:-out}"

if [ ! -d "$OUT_DIR" ]; then
  echo "❌ ERREUR: Le dossier $OUT_DIR n'existe pas"
  exit 1
fi

echo "🔍 Vérification du build dans $OUT_DIR..."

# 1. Vérifier que index.html existe
if [ ! -f "$OUT_DIR/index.html" ]; then
  echo "❌ ERREUR: index.html manquant dans $OUT_DIR/"
  exit 1
fi
echo "✅ index.html trouvé"

# 2. Vérifier qu'il n'y a pas de fichiers HTML à la racine sauf index.html et 404.html
html_files=$(find "$OUT_DIR" -maxdepth 1 -name "*.html" -type f ! -name "index.html" ! -name "404.html" 2>/dev/null || true)
if [ -n "$html_files" ]; then
  echo "❌ ERREUR CRITIQUE: Fichiers HTML trouvés à la racine de $OUT_DIR/ (sauf index.html et 404.html):"
  echo "$html_files"
  echo ""
  echo "⚠️  PROBLÈME: Ces fichiers peuvent être servis par GitHub Pages au lieu de index.html"
  echo "📝 SOLUTION: Déplacer ces fichiers dans un sous-dossier (ex: docs/)"
  echo ""
  echo "🔧 Actions à prendre:"
  echo "   1. Déplacer les fichiers HTML de documentation dans public/docs/ au lieu de public/"
  echo "   2. Mettre à jour les références dans le code"
  echo "   3. Rebuild et vérifier à nouveau"
  exit 1
fi
echo "✅ Aucun fichier HTML indésirable à la racine"

# 3. Vérifier que index.html contient l'application React
if ! grep -q "OTT Dashboard\|root\|__next\|__next_f" "$OUT_DIR/index.html"; then
  echo "⚠️  ATTENTION: index.html ne semble pas contenir l'application React"
  echo "⚠️  Vérifiez que le build Next.js s'est bien déroulé"
else
  echo "✅ index.html contient l'application React"
fi

# 4. Vérifier que les fichiers de documentation sont bien dans docs/
if [ -d "$OUT_DIR/docs" ]; then
  doc_count=$(find "$OUT_DIR/docs" -name "DOCUMENTATION_*.html" -type f 2>/dev/null | wc -l)
  if [ "$doc_count" -gt 0 ]; then
    echo "✅ $doc_count fichier(s) de documentation trouvé(s) dans $OUT_DIR/docs/"
  fi
fi

echo ""
echo "✅ Vérification terminée - Build valide"

