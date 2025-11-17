#!/bin/bash
# ================================================================================
# Script Bash - Export statique Next.js (sans routes API)
# ================================================================================
# HAPPLYZ MEDICAL SAS
# Usage: bash scripts/export_static.sh
# ================================================================================

set -e

echo "======================================"
echo "  OTT - Export Statique"
echo "  HAPPLYZ MEDICAL SAS"
echo "======================================"
echo ""

# Chemins
API_ROUTE_PATH="app/api/proxy/[...path]/route.js"
API_ROUTE_BACKUP="app/api/proxy/[...path]/route.js.bak"
OUT_PATH="out"
NEXT_PATH=".next"

# Nettoyer les anciens builds
echo "🧹 Nettoyage..."
if [ -d "$OUT_PATH" ]; then
    rm -rf "$OUT_PATH"
    echo "   ✅ Dossier 'out' supprimé"
fi
if [ -d "$NEXT_PATH" ]; then
    rm -rf "$NEXT_PATH"
    echo "   ✅ Dossier '.next' supprimé"
fi
echo ""

# Sauvegarder le fichier route.js de l'API (incompatible avec export statique)
API_ROUTE_EXISTS=false
if [ -f "$API_ROUTE_PATH" ]; then
    API_ROUTE_EXISTS=true
    echo "📦 Sauvegarde de la route API..."
    if [ -f "$API_ROUTE_BACKUP" ]; then
        rm -f "$API_ROUTE_BACKUP"
    fi
    mv "$API_ROUTE_PATH" "$API_ROUTE_BACKUP"
    echo "   ✅ Route API sauvegardée"
    echo ""
fi

# Fonction de restauration
restore_api_route() {
    if [ "$API_ROUTE_EXISTS" = true ] && [ -f "$API_ROUTE_BACKUP" ]; then
        echo "🔄 Restauration de la route API..."
        if [ -f "$API_ROUTE_PATH" ]; then
            rm -f "$API_ROUTE_PATH"
        fi
        mv "$API_ROUTE_BACKUP" "$API_ROUTE_PATH"
        echo "   ✅ Route API restaurée"
        echo ""
    fi
}

# Trap pour restaurer en cas d'erreur
trap restore_api_route EXIT

# Export statique
echo "🔨 Génération de l'export statique..."
echo "   (Cela peut prendre quelques minutes...)"
echo ""

export NEXT_STATIC_EXPORT="true"
export NEXT_PUBLIC_BASE_PATH="/OTT"
export NEXT_PUBLIC_API_URL="https://ott-jbln.onrender.com"
export NEXT_PUBLIC_ENABLE_DEMO_RESET="false"
export NODE_ENV="production"

npm run export

echo ""
echo "✅ Export statique généré avec succès!"
echo ""

# Vérifier que les fichiers ont été générés
if [ ! -f "$OUT_PATH/index.html" ]; then
    echo "❌ ERREUR: index.html non trouvé dans out/"
    exit 1
fi

# Compter les fichiers générés
OUT_FILES_COUNT=$(find "$OUT_PATH" -type f | wc -l)
echo "📊 Fichiers générés: $OUT_FILES_COUNT"

# Vérifier les fichiers CSS
CSS_PATH="$OUT_PATH/_next/static/css"
if [ -d "$CSS_PATH" ]; then
    CSS_FILES_COUNT=$(find "$CSS_PATH" -type f | wc -l)
    echo "   ✅ Fichiers CSS: $CSS_FILES_COUNT"
    for css_file in "$CSS_PATH"/*.css; do
        if [ -f "$css_file" ]; then
            echo "      - $(basename "$css_file")"
        fi
    done
fi

echo ""

# Restaurer la route API
restore_api_route

# Désactiver le trap maintenant que tout est OK
trap - EXIT

echo "======================================"
echo "  ✅ SUCCÈS!"
echo "======================================"
echo ""
echo "📦 Export statique disponible dans 'out/'"
echo ""

