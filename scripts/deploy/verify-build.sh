#!/bin/bash
# Script de vérification du build Next.js pour GitHub Pages
# Usage: bash scripts/deploy/verify-build.sh <output_directory>

set -e

OUTPUT_DIR="${1:-out}"

if [ ! -d "$OUTPUT_DIR" ]; then
    echo "❌ ERREUR: Le dossier $OUTPUT_DIR n'existe pas"
    exit 1
fi

echo "🔍 Vérification du build dans $OUTPUT_DIR..."
echo ""

# Fichiers critiques requis
critical_files=(
    "$OUTPUT_DIR/index.html"
    "$OUTPUT_DIR/sw.js"
    "$OUTPUT_DIR/manifest.json"
)

missing_files=0
for file in "${critical_files[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✅ $(basename "$file")"
    else
        echo "  ❌ MANQUANT $(basename "$file")"
        missing_files=$((missing_files + 1))
    fi
done

# Vérifier les assets Next.js
if [ -d "$OUTPUT_DIR/_next" ]; then
    echo "  ✅ Dossier _next/ présent"
    
    # Vérifier les fichiers CSS
    if [ -d "$OUTPUT_DIR/_next/static/css" ]; then
        css_count=$(find "$OUTPUT_DIR/_next/static/css" -name "*.css" 2>/dev/null | wc -l)
        if [ "$css_count" -gt 0 ]; then
            echo "  ✅ Fichiers CSS: $css_count"
        else
            echo "  ⚠️  Aucun fichier CSS trouvé"
        fi
    else
        echo "  ⚠️  Dossier _next/static/css manquant"
    fi
    
    # Vérifier les fichiers JS
    if [ -d "$OUTPUT_DIR/_next/static/chunks" ]; then
        js_count=$(find "$OUTPUT_DIR/_next/static/chunks" -name "*.js" 2>/dev/null | wc -l)
        if [ "$js_count" -gt 0 ]; then
            echo "  ✅ Fichiers JS: $js_count"
        else
            echo "  ⚠️  Aucun fichier JS trouvé"
        fi
    else
        echo "  ⚠️  Dossier _next/static/chunks manquant"
    fi
else
    echo "  ❌ ERREUR: Dossier _next/ manquant"
    missing_files=$((missing_files + 1))
fi

# Vérifier les pages statiques importantes
static_pages=(
    "$OUTPUT_DIR/migrate.html"
    "$OUTPUT_DIR/diagnostic-measurements.html"
)

echo ""
echo "📄 Vérification des pages statiques..."
for page in "${static_pages[@]}"; do
    if [ -f "$page" ]; then
        echo "  ✅ $(basename "$page")"
    else
        echo "  ⚠️  $(basename "$page") non trouvé (optionnel)"
    fi
done

# Vérifier .nojekyll
if [ -f "$OUTPUT_DIR/.nojekyll" ]; then
    echo "  ✅ .nojekyll présent"
else
    echo "  ⚠️  .nojekyll manquant (sera créé par le workflow)"
fi

# Résumé
echo ""
if [ "$missing_files" -eq 0 ]; then
    echo "✅ Vérification réussie - Tous les fichiers critiques sont présents"
    exit 0
else
    echo "❌ ERREUR: $missing_files fichier(s) critique(s) manquant(s)"
    exit 1
fi


