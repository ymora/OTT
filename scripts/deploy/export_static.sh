#!/bin/bash
# Script Bash pour exporter Next.js en site statique pour GitHub Pages
# Usage: bash scripts/deploy/export_static.sh

set -e  # Arrêter en cas d'erreur

echo "📦 Export statique Next.js pour GitHub Pages"
echo ""

# Les variables d'environnement sont définies par GitHub Actions
# NEXT_STATIC_EXPORT=true
# NEXT_PUBLIC_BASE_PATH=/OTT
# NEXT_PUBLIC_API_URL=https://ott-jbln.onrender.com
# NODE_ENV=production

echo "Variables d'environnement:"
echo "  NEXT_STATIC_EXPORT=${NEXT_STATIC_EXPORT:-not set}"
echo "  NEXT_PUBLIC_BASE_PATH=${NEXT_PUBLIC_BASE_PATH:-not set}"
echo "  NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-not set}"
echo ""

# Nettoyer l'ancien build
if [ -d "out" ]; then
    echo "🧹 Nettoyage de l'ancien build..."
    rm -rf out
fi

# Exporter le site statique
echo "🔨 Build et export en cours..."
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
echo "✅ Vérification des fichiers critiques..."
critical_files=(
    "out/index.html"
    "out/sw.js"
    "out/manifest.json"
    "out/icon-192.png"
    "out/icon-512.png"
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

# Vérifier les fichiers CSS
if [ -d "out/_next/static/css" ]; then
    css_count=$(find out/_next/static/css -name "*.css" | wc -l)
    if [ "$css_count" -gt 0 ]; then
        echo "  ✅ Fichiers CSS: $css_count trouvé(s)"
    else
        echo "  ⚠️  ATTENTION: Aucun fichier CSS trouvé dans out/_next/static/css"
    fi
else
    echo "  ⚠️  ATTENTION: Dossier out/_next/static/css non trouvé"
fi

# Vérifier les fichiers JS
if [ -d "out/_next/static/chunks" ]; then
    js_count=$(find out/_next/static/chunks -name "*.js" | wc -l)
    if [ "$js_count" -gt 0 ]; then
        echo "  ✅ Fichiers JS: $js_count trouvé(s)"
    else
        echo "  ⚠️  ATTENTION: Aucun fichier JS trouvé dans out/_next/static/chunks"
    fi
else
    echo "  ⚠️  ATTENTION: Dossier out/_next/static/chunks non trouvé"
fi

if [ "$missing_files" -gt 0 ]; then
    echo ""
    echo "⚠️  ATTENTION: $missing_files fichier(s) critique(s) manquant(s)"
    echo "   Le déploiement pourrait échouer"
fi

# Vérifier que les fichiers de documentation sont dans out/docs/ (copiés automatiquement par Next.js depuis public/)
echo "📄 Vérification des fichiers de documentation..."
required_docs=(
    "out/docs/DOCUMENTATION_PRESENTATION.html"
    "out/docs/DOCUMENTATION_DEVELOPPEURS.html"
    "out/docs/DOCUMENTATION_COMMERCIALE.html"
)

missing_docs=0
for doc in "${required_docs[@]}"; do
    if [ -f "$doc" ]; then
        echo "  ✅ $(basename "$doc")"
    else
        echo "  ❌ MANQUANT $(basename "$doc")"
        missing_docs=$((missing_docs + 1))
        # Copier depuis public/docs/ si manquant
        source_doc="public/docs/$(basename "$doc")"
        if [ -f "$source_doc" ]; then
            echo "    📋 Copie depuis public/docs/..."
            mkdir -p "$(dirname "$doc")"
            cp "$source_doc" "$doc"
            echo "    ✅ Copie réussie"
        fi
    fi
done

# Copier les screenshots si manquants
if [ -d "public/docs/screenshots" ] && [ ! -d "out/docs/screenshots" ]; then
    echo "  📸 Copie des screenshots..."
    cp -r "public/docs/screenshots" "out/docs/screenshots"
    echo "    ✅ Screenshots copiés"
fi

# Vérification finale : s'assurer que tous les fichiers de documentation sont présents et à jour
echo ""
echo "🔍 Vérification finale des fichiers de documentation..."
final_missing=0
for doc in "${required_docs[@]}"; do
    if [ ! -f "$doc" ]; then
        echo "  ❌ ERREUR: $(basename "$doc") manquant dans out/docs/"
        final_missing=$((final_missing + 1))
    fi
done

if [ "$final_missing" -gt 0 ]; then
    echo ""
    echo "❌ ERREUR: $final_missing fichier(s) de documentation manquant(s)"
    echo "   Le déploiement GitHub Pages échouera pour ces fichiers"
    exit 1
fi

echo "✅ Tous les fichiers de documentation sont présents"
echo ""
echo "✅ Export réussi !"
file_count=$(find out -type f | wc -l)
echo "   Dossier: out/"
echo "   Fichiers: $file_count"
echo ""

