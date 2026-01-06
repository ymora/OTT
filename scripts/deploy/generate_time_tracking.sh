#!/bin/bash
# Script pour générer SUIVI_TEMPS_FACTURATION.md avec stats par contributeur
# Version synchronisée avec Generate-GitStats.ps1

set +e

echo "📄 Génération du fichier SUIVI_TEMPS_FACTURATION.md..."

OUTPUT_FILE="public/docs/SUIVI_TEMPS_FACTURATION.md"
DAYS=365

# Créer le dossier public/docs/ s'il n'existe pas
mkdir -p public/docs

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

# Date de début pour le filtrage
SINCE_DATE=$(date -d "$DAYS days ago" +%Y-%m-%d)
GEN_DATE=$(date -u +"%Y-%m-%d %H:%M")

# Récupérer tous les commits avec informations détaillées
COMMITS=$(git log --all --since="$SINCE_DATE" --format="%H|%an|%ae|%ci|%s" 2>/dev/null || echo "")

if [ -z "$COMMITS" ]; then
    echo "⚠️  Aucun commit trouvé dans la période, création d'un fichier minimal"
    cat > "$OUTPUT_FILE" << EOF
# Suivi du Temps - Projet OTT
## Journal de travail pour facturation (Généré automatiquement)

**Date de génération** : $GEN_DATE
**Période analysée** : $DAYS derniers jours (depuis $SINCE_DATE)
**Total commits** : 0
**Contributeurs** : 0

---

---
_Rapport généré automatiquement par generate_time_tracking.sh_
EOF
    echo "✅ Fichier minimal créé : $OUTPUT_FILE"
    exit 0
fi

# Parser les commits et collecter les statistiques
declare -A author_stats
declare -A author_days
declare -A author_categories
declare -A daily_stats
total_commits=0

while IFS='|' read -r hash author email date_time message; do
    if [ -z "$author" ] || [ -z "$message" ]; then continue; fi
    
    # Nettoyer les données
    author=$(echo "$author" | tr -d ' ')
    date_str=$(echo "$date_time" | cut -d' ' -f1)
    
    # === DÉTECTION DU DÉVELOPPEUR RÉÉL ===
    # Mapper l'auteur Git vers le développeur réel selon des règles
    
    # Règle 1: Si le message contient des patterns spécifiques
    msg_lower=$(echo "$message" | tr '[:upper:]' '[:lower:]')
    real_author="$author"
    
    # Patterns pour Maxime
    if [[ "$msg_lower" =~ (maxime|frontend|react|next\.js|ui|dashboard|interface|design|css|tailwind) ]]; then
        real_author="Maxime"
    # Patterns pour Yannick  
    elif [[ "$msg_lower" =~ (yannick|backend|api|php|database|sql|firmware|arduino|esp32|usb) ]]; then
        real_author="Yannick"
    # Règle 2: Selon le type de fichiers modifiés (si disponible)
    elif [[ "$message" =~ (api|php|sql|database|firmware|hardware) ]]; then
        real_author="Yannick"
    elif [[ "$message" =~ (dashboard|frontend|ui|react|next|page) ]]; then
        real_author="Maxime"
    # Règle 3: Selon l'heure ou la date (si vous travaillez à des moments différents)
    # Vous pouvez ajouter des règles basées sur les heures si nécessaire
    fi
    
    # Utiliser le vrai développeur détecté
    author="$real_author"
    
    # Initialiser les stats pour cet auteur
    if [ -z "${author_stats[$author]}" ]; then
        author_stats[$author]=0
        author_days[$author]=""
        author_categories[$author]="0|0|0|0|0|0|0|0"  # Feature|Fix|Refactor|Doc|Test|UI|Deploy|Other
    fi
    
    # Incrémenter les stats
    author_stats[$author]=$((${author_stats[$author]} + 1))
    total_commits=$((total_commits + 1))
    
    # Ajouter le jour à la liste des jours actifs de l'auteur
    if [[ "$author_days[$author]" != *"$date_str"* ]]; then
        author_days[$author]="${author_days[$author]} $date_str"
    fi
    
    # Statistiques quotidiennes
    daily_key="$date_str|$author"
    daily_stats[$daily_key]=$((${daily_stats[$daily_key]} + 1))
    
    # Catégoriser le commit
    # msg_lower déjà défini plus haut
    IFS='|' read -r feat fix refactor doc test ui deploy other <<< "${author_categories[$author]}"
    
    if [[ "$msg_lower" =~ (feat|feature|add|ajout|nouveau) ]]; then
        feat=$((feat + 1))
    elif [[ "$msg_lower" =~ (fix|bug|corr|repair) ]]; then
        fix=$((fix + 1))
    elif [[ "$msg_lower" =~ (refact|clean|optim) ]]; then
        refactor=$((refactor + 1))
    elif [[ "$msg_lower" =~ (doc|readme|comment) ]]; then
        doc=$((doc + 1))
    elif [[ "$msg_lower" =~ (test|spec|jest) ]]; then
        test=$((test + 1))
    elif [[ "$msg_lower" =~ (ui|css|style|design|interface) ]]; then
        ui=$((ui + 1))
    elif [[ "$msg_lower" =~ (deploy|release|version|build) ]]; then
        deploy=$((deploy + 1))
    else
        other=$((other + 1))
    fi
    
    author_categories[$author]="$feat|$fix|$refactor|$doc|$test|$ui|$deploy|$other"
done <<< "$COMMITS"

# Générer le fichier Markdown
cat > "$OUTPUT_FILE" << EOF
# Suivi du Temps - Projet OTT
## Journal de travail pour facturation (Généré automatiquement)

**Date de génération** : $GEN_DATE
**Période analysée** : $DAYS derniers jours (depuis $SINCE_DATE)
**Total commits** : $total_commits
**Contributeurs** : ${#author_stats[@]}

---

## Tableau Recapitulatif par Jour et Contributeur

| Date | Contributeur | Commits | Heures | Features | Fix | Refactor | Doc | Tests | UI |
|------|--------------|---------|--------|----------|-----|----------|-----|-------|-----|
EOF

# Trier et afficher les statistiques quotidiennes
for daily_key in $(printf '%s\n' "${!daily_stats[@]}" | sort -r | head -100); do
    IFS='|' read -r date_str author <<< "$daily_key"
    commits=${daily_stats[$daily_key]}
    hours=$(echo "scale=1; $commits * 0.5" | bc 2>/dev/null || echo "~${commits/2}h")
    
    # Récupérer les catégories pour ce jour et cet auteur
    IFS='|' read -r feat fix refactor doc test ui deploy other <<< "${author_categories[$author]}"
    
    echo "| $date_str | **$author** | $commits | ~${hours}h | $feat | $fix | $refactor | $doc | $test | $ui |" >> "$OUTPUT_FILE"
done

# Ajouter le résumé par contributeur
cat >> "$OUTPUT_FILE" << EOF

---

## Resume par Contributeur

EOF

# Trier les contributeurs par nombre de commits
for author in $(printf '%s\n' "${!author_stats[@]}" | while read -r a; do echo "${author_stats[$a]} $a"; done | sort -nr | cut -d' ' -f2-); do
    commits=${author_stats[$author]}
    contribution=$(echo "scale=1; $commits * 100 / $total_commits" | bc 2>/dev/null || echo "0")
    hours=$(echo "scale=1; $commits * 0.5" | bc 2>/dev/null || echo "0")
    days_active=$(echo "${author_days[$author]}" | wc -w)
    avg_commits=$(echo "scale=2; $commits / $days_active" | bc 2>/dev/null || echo "0")
    
    cat >> "$OUTPUT_FILE" << EOF
### $author
- **Total commits** : $commits ($contribution%)
- **Heures estimees** : ~${hours}h
- **Jours actifs** : $days_active
- **Moyenne** : $avg_commits commits/jour

EOF
done

# Ajouter le footer
cat >> "$OUTPUT_FILE" << EOF

---
_Rapport généré automatiquement par generate_time_tracking.sh_
_Basé sur l'analyse Git des commits du projet_
EOF

# Vérifier que le fichier a été créé
if [ -f "$OUTPUT_FILE" ]; then
    echo "✅ Fichier généré : $OUTPUT_FILE"
    echo "   Commits analysés : $total_commits"
    echo "   Contributeurs : ${#author_stats[@]}"
    ls -lh "$OUTPUT_FILE"
    exit 0
else
    echo "❌ ERREUR: Le fichier n'a pas été créé"
    exit 1
fi
