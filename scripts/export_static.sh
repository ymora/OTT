#!/usr/bin/env bash
# Script pour exporter Next.js en site statique pour GitHub Pages
# Usage: ./scripts/export_static.sh

set -euo pipefail

echo "📦 Export statique Next.js pour GitHub Pages"
echo ""

# Vérifier que les variables d'environnement sont définies
if [ -z "${NEXT_STATIC_EXPORT:-}" ]; then
  echo "⚠️  NEXT_STATIC_EXPORT non défini, utilisation de 'true' par défaut"
  export NEXT_STATIC_EXPORT="true"
fi

if [ -z "${NEXT_PUBLIC_BASE_PATH:-}" ]; then
  echo "⚠️  NEXT_PUBLIC_BASE_PATH non défini, utilisation de '/OTT' par défaut"
  export NEXT_PUBLIC_BASE_PATH="/OTT"
fi

if [ -z "${NEXT_PUBLIC_API_URL:-}" ]; then
  echo "⚠️  NEXT_PUBLIC_API_URL non défini, utilisation de 'https://ott-jbln.onrender.com' par défaut"
  export NEXT_PUBLIC_API_URL="https://ott-jbln.onrender.com"
fi

echo "Variables d'environnement:"
echo "  NEXT_STATIC_EXPORT=$NEXT_STATIC_EXPORT"
echo "  NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH"
echo "  NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL"
echo ""

# Nettoyer l'ancien build
if [ -d "out" ]; then
  echo "🧹 Nettoyage de l'ancien build..."
  rm -rf out
fi

# Exporter le site statique
echo "🔨 Build et export en cours..."
# Appeler directement next build au lieu de npm run export (qui utilise PowerShell)
npx next build

# Vérifier que le build a réussi
if [ ! -d "out" ]; then
  echo "❌ ERREUR: Le dossier 'out' n'a pas été créé"
  exit 1
fi

if [ ! -f "out/index.html" ]; then
  echo "❌ ERREUR: index.html non trouvé dans out/"
  exit 1
fi

# Vérifier les fichiers critiques
echo "🔍 Vérification des fichiers critiques..."
CRITICAL_FILES=(
  "out/index.html"
  "out/sw.js"
  "out/manifest.json"
  "out/icon-192.png"
  "out/icon-512.png"
)

MISSING_FILES=0
for file in "${CRITICAL_FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "  ✓ $(basename $file)"
  else
    echo "  ✗ $(basename $file) - MANQUANT"
    MISSING_FILES=$((MISSING_FILES + 1))
  fi
done

# Vérifier les fichiers CSS
CSS_COUNT=$(find out/_next/static/css -name "*.css" 2>/dev/null | wc -l || echo "0")
if [ "$CSS_COUNT" -gt 0 ]; then
  echo "  ✓ Fichiers CSS: $CSS_COUNT trouvé(s)"
else
  echo "  ⚠️  Aucun fichier CSS trouvé dans out/_next/static/css"
fi

# Vérifier les fichiers JS
JS_COUNT=$(find out/_next/static/chunks -name "*.js" 2>/dev/null | wc -l || echo "0")
if [ "$JS_COUNT" -gt 0 ]; then
  echo "  ✓ Fichiers JS: $JS_COUNT trouvé(s)"
else
  echo "  ⚠️  Aucun fichier JS trouvé dans out/_next/static/chunks"
fi

if [ $MISSING_FILES -gt 0 ]; then
  echo ""
  echo "⚠️  ATTENTION: $MISSING_FILES fichier(s) critique(s) manquant(s)"
  echo "   Le déploiement pourrait échouer"
fi

echo ""
echo "✅ Export réussi !"
echo "   Dossier: out/"
echo "   Fichiers: $(find out -type f | wc -l)"
echo ""

