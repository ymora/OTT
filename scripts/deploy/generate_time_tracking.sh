#!/bin/bash
# Script pour générer SUIVI_TEMPS_FACTURATION.md depuis les commits Git

# Ne pas utiliser set -e pour permettre la gestion d'erreurs
set +e

echo "📄 Génération du fichier SUIVI_TEMPS_FACTURATION.md..."

OUTPUT_FILE="public/SUIVI_TEMPS_FACTURATION.md"

# Créer le dossier public/ s'il n'existe pas
mkdir -p public

# Vérifier que Git est disponible
if ! command -v git &> /dev/null; then
    echo "⚠️  Git non disponible, création d'un fichier minimal"
    cat > "$OUTPUT_FILE" << 'EOF'
# Suivi du Temps - Projet OTT
## Journal de travail pour facturation (Généré automatiquement)

> **Note**: Ce fichier est généré automatiquement. Pour une version complète, utilisez le script d'audit ou l'API.

**Période analysée** : En cours
**Développeur** : ymora

### Statistiques
- **Total heures** : En cours de calcul...
- **Total commits** : En cours de calcul...

---
*Ce fichier sera mis à jour lors du prochain audit complet.*
EOF
    exit 0
fi

# Récupérer tous les commits de ymora (sans --remotes pour éviter les erreurs si pas de remote)
COMMITS=$(git log --all --author="*ymora*" --format="%ci|%an|%s|%H" 2>/dev/null || echo "")

if [ -z "$COMMITS" ]; then
    echo "⚠️  Aucun commit trouvé pour ymora, création d'un fichier minimal"
    cat > "$OUTPUT_FILE" << 'EOF'
# Suivi du Temps - Projet OTT
## Journal de travail pour facturation (Généré automatiquement)

> **Note**: Ce fichier est généré automatiquement. Pour une version complète, utilisez le script d'audit ou l'API.

**Période analysée** : En cours
**Développeur** : ymora

### Statistiques
- **Total heures** : 0
- **Total commits** : 0

---
*Ce fichier sera mis à jour lors du prochain audit complet.*
EOF
    echo "✅ Fichier minimal créé : $OUTPUT_FILE"
    exit 0
fi

# Compter les commits (gérer le cas où COMMITS est vide)
COMMIT_COUNT=$(echo "$COMMITS" | grep -v '^$' | wc -l | tr -d ' ')

# Si aucun commit, créer un fichier minimal
if [ "$COMMIT_COUNT" -eq 0 ] || [ -z "$COMMIT_COUNT" ]; then
    echo "⚠️  Aucun commit trouvé, création d'un fichier minimal"
    cat > "$OUTPUT_FILE" << 'EOF'
# Suivi du Temps - Projet OTT
## Journal de travail pour facturation (Généré automatiquement)

> **Note**: Ce fichier est généré automatiquement. Pour une version complète, utilisez le script d'audit ou l'API.

**Période analysée** : En cours
**Développeur** : ymora

### Statistiques
- **Total heures** : 0
- **Total commits** : 0

---
*Ce fichier sera mis à jour lors du prochain audit complet.*
EOF
    echo "✅ Fichier minimal créé : $OUTPUT_FILE"
    exit 0
fi

# Générer le fichier Markdown
cat > "$OUTPUT_FILE" << EOF
# Suivi du Temps - Projet OTT
## Journal de travail pour facturation (Généré automatiquement)

**Période analysée** : $(date -u +"%Y-%m-%d")
**Développeur** : ymora

### Statistiques Générales

- **Total commits** : $COMMIT_COUNT
- **Date de génération** : $(date -u +"%Y-%m-%d %H:%M UTC")

### Détails des Commits

EOF

# Ajouter les commits (limiter à 100 pour éviter un fichier trop volumineux)
echo "$COMMITS" | grep -v '^$' | head -100 | while IFS='|' read -r date_time author message hash; do
    if [ -n "$date_time" ] && [ -n "$message" ]; then
        date_only=$(echo "$date_time" | cut -d' ' -f1)
        time_only=$(echo "$date_time" | cut -d' ' -f2)
        echo "- **$date_only $time_only** : $message" >> "$OUTPUT_FILE"
    fi
done

# Ajouter le footer
cat >> "$OUTPUT_FILE" << 'EOF'

---

_Rapport généré automatiquement le $(date -u +"%Y-%m-%d %H:%M UTC")_
_Basé sur l'analyse Git des commits de ymora_
EOF

# Vérifier que le fichier a été créé
if [ -f "$OUTPUT_FILE" ]; then
    echo "✅ Fichier généré : $OUTPUT_FILE"
    echo "   Commits analysés : $COMMIT_COUNT"
    ls -lh "$OUTPUT_FILE"
    exit 0
else
    echo "❌ ERREUR: Le fichier n'a pas été créé"
    # Créer un fichier minimal en dernier recours
    cat > "$OUTPUT_FILE" << 'EOF'
# Suivi du Temps - Projet OTT
## Journal de travail pour facturation (Généré automatiquement)

> **Note**: Ce fichier est généré automatiquement. Pour une version complète, utilisez le script d'audit ou l'API.

**Période analysée** : En cours
**Développeur** : ymora

### Statistiques
- **Total heures** : 0
- **Total commits** : 0

---
*Ce fichier sera mis à jour lors du prochain audit complet.*
EOF
    echo "✅ Fichier minimal créé en dernier recours : $OUTPUT_FILE"
    exit 0
fi

