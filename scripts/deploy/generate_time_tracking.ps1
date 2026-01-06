# Script PowerShell pour générer SUIVI_TEMPS_FACTURATION.md avec stats par contributeur
# Version synchronisée avec generate_time_tracking.sh

Write-Host "📄 Génération du fichier SUIVI_TEMPS_FACTURATION.md..."

$OUTPUT_FILE = "public/docs/SUIVI_TEMPS_FACTURATION.md"
$DAYS = 365

# Créer le dossier public/docs/ s'il n'existe pas
if (!(Test-Path "public/docs")) {
    New-Item -ItemType Directory -Force -Path "public/docs"
}

# Vérifier que Git est disponible
if (!(Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "⚠️  Git non disponible, création d'un fichier minimal"
    @"
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
"@ | Out-File -FilePath $OUTPUT_FILE -Encoding UTF8
    exit 0
}

# Date de début pour le filtrage
$SINCE_DATE = (Get-Date).AddDays(-$DAYS).ToString("yyyy-MM-dd")
$GEN_DATE = Get-Date -Format "yyyy-MM-dd HH:mm"

# Récupérer tous les commits avec informations détaillées
$COMMITS = git log --all --since="$SINCE_DATE" --format="%H|%an|%ae|%ci|%s" 2>$null

if ([string]::IsNullOrEmpty($COMMITS)) {
    Write-Host "⚠️  Aucun commit trouvé dans la période, création d'un fichier minimal"
    @"
# Suivi du Temps - Projet OTT
## Journal de travail pour facturation (Généré automatiquement)

**Date de génération** : $GEN_DATE
**Période analysée** : $DAYS derniers jours (depuis $SINCE_DATE)
**Total commits** : 0
**Contributeurs** : 0

---

---
_Rapport généré automatiquement par generate_time_tracking.ps1_
"@ | Out-File -FilePath $OUTPUT_FILE -Encoding UTF8
    Write-Host "✅ Fichier minimal créé : $OUTPUT_FILE"
    exit 0
}

# Parser les commits et collecter les statistiques
$author_stats = @{}
$author_days = @{}
$author_categories = @{}
$daily_stats = @{}
$daily_categories = @{}
$total_commits = 0

foreach ($line in $COMMITS -split "`n") {
    if ([string]::IsNullOrEmpty($line)) { continue }
    
    $parts = $line -split '\|'
    if ($parts.Length -lt 5) { continue }
    
    $hash = $parts[0]
    $author = $parts[1].Trim()
    $email = $parts[2]
    $date_time = $parts[3]
    $message = $parts[4]
    
    if ([string]::IsNullOrEmpty($author) -or [string]::IsNullOrEmpty($message)) { continue }
    
    $date_str = $date_time.Split(' ')[0]
    
    # === DÉTECTION DU DÉVELOPPEUR RÉÉL ===
    # Mapper l'auteur Git vers le développeur réel selon des règles
    
    # ATTENTION: Maxime n'a pas encore travaillé sur le projet
    # On ne détecte que Yannick pour l'instant
    # Quand Maxime travaillera, ses commits apparaîtront avec son propre nom Git
    
    # Mapper les noms pour plus de clarté
    if ($author -eq "ymora") {
        $author = "Yannick"
    }
    
    # Initialiser les stats pour cet auteur
    if (!$author_stats.ContainsKey($author)) {
        $author_stats[$author] = 0
        $author_days[$author] = @()
        $author_categories[$author] = "0|0|0|0|0|0|0|0"  # Feature|Fix|Refactor|Doc|Test|UI|Deploy|Other
    }
    
    # Incrémenter les stats
    $author_stats[$author]++
    $total_commits++
    
    # Ajouter le jour à la liste des jours actifs de l'auteur
    if ($author_days[$author] -notcontains $date_str) {
        $author_days[$author] += $date_str
    }
    
    # Statistiques quotidiennes
    $daily_key = "$date_str|$author"
    if (!$daily_stats.ContainsKey($daily_key)) {
        $daily_stats[$daily_key] = 0
        $daily_categories[$daily_key] = "0|0|0|0|0|0|0|0"  # Feature|Fix|Refactor|Doc|Test|UI|Deploy|Other
    }
    $daily_stats[$daily_key]++
    
    # Catégoriser le commit
    $msg_lower = $message.ToLower()
    
    # Mettre à jour les catégories globales de l'auteur
    $categories = $author_categories[$author].Split('|')
    $feat = [int]$categories[0]
    $fix = [int]$categories[1]
    $refactor = [int]$categories[2]
    $doc = [int]$categories[3]
    $test = [int]$categories[4]
    $ui = [int]$categories[5]
    $deploy = [int]$categories[6]
    $other = [int]$categories[7]
    
    # Mettre à jour les catégories quotidiennes
    $daily_cats = $daily_categories[$daily_key].Split('|')
    $daily_feat = [int]$daily_cats[0]
    $daily_fix = [int]$daily_cats[1]
    $daily_refactor = [int]$daily_cats[2]
    $daily_doc = [int]$daily_cats[3]
    $daily_test = [int]$daily_cats[4]
    $daily_ui = [int]$daily_cats[5]
    $daily_deploy = [int]$daily_cats[6]
    $daily_other = [int]$daily_cats[7]
    
    if ($msg_lower -match 'feat|feature|add|ajout|nouveau') {
        $feat++; $daily_feat++
    }
    elseif ($msg_lower -match 'fix|bug|corr|repair') {
        $fix++; $daily_fix++
    }
    elseif ($msg_lower -match 'refact|clean|optim') {
        $refactor++; $daily_refactor++
    }
    elseif ($msg_lower -match 'doc|readme|comment') {
        $doc++; $daily_doc++
    }
    elseif ($msg_lower -match 'test|spec|jest') {
        $test++; $daily_test++
    }
    elseif ($msg_lower -match 'ui|css|style|design|interface') {
        $ui++; $daily_ui++
    }
    elseif ($msg_lower -match 'deploy|release|version|build') {
        $deploy++; $daily_deploy++
    }
    else {
        $other++; $daily_other++
    }
    
    $author_categories[$author] = "$feat|$fix|$refactor|$doc|$test|$ui|$deploy|$other"
    $daily_categories[$daily_key] = "$daily_feat|$daily_fix|$daily_refactor|$daily_doc|$daily_test|$daily_ui|$daily_deploy|$daily_other"
}

# Générer le fichier Markdown
$content = @"
# Suivi du Temps - Projet OTT
## Journal de travail pour facturation (Généré automatiquement)

**Date de génération** : $GEN_DATE
**Période analysée** : $DAYS derniers jours (depuis $SINCE_DATE)
**Total commits** : $total_commits
**Contributeurs** : $($author_stats.Count)

---

## Tableau Recapitulatif par Jour et Contributeur

| Date | Contributeur | Commits | Heures | Features | Fix | Refactor | Doc | Tests | UI | Deploy | Other |
|------|--------------|---------|--------|----------|-----|----------|-----|-------|-----|--------|-------|
"@

# Trier et afficher les statistiques quotidiennes avec catégories par jour
$daily_keys = $daily_stats.Keys | Sort-Object -Descending | Select-Object -First 100
foreach ($daily_key in $daily_keys) {
    $parts = $daily_key.Split('|')
    $date_str = $parts[0]
    $author = $parts[1]
    $commits = $daily_stats[$daily_key]
    $hours = [math]::Round($commits * 0.5, 1)
    
    # Récupérer les catégories pour CE jour et CET auteur
    $categories = $daily_categories[$daily_key].Split('|')
    $feat = $categories[0]
    $fix = $categories[1]
    $refactor = $categories[2]
    $doc = $categories[3]
    $test = $categories[4]
    $ui = $categories[5]
    $deploy = $categories[6]
    $other = $categories[7]
    
    $content += "`n| $date_str | **$author** | $commits commits (~${hours}h) | $feat Features | $fix Fixes | $refactor Refactors | $doc Docs | $test Tests | $ui UI | $deploy Deploy | $other Other |"
}

# Ajouter le résumé par contributeur
$content += @"

---

## Resume par Contributeur

"@

# Trier les contributeurs par nombre de commits
$sorted_authors = $author_stats.GetEnumerator() | Sort-Object -Property Value -Descending
foreach ($author_entry in $sorted_authors) {
    $author = $author_entry.Key
    $commits = $author_entry.Value
    $contribution = [math]::Round($commits * 100 / $total_commits, 1)
    $hours = [math]::Round($commits * 0.5, 1)
    $days_active = $author_days[$author].Count
    $avg_commits = [math]::Round($commits / $days_active, 2)
    
    $content += @"

### $author
- **Total commits** : $commits ($contribution%)
- **Heures estimees** : ~${hours}h
- **Jours actifs** : $days_active
- **Moyenne** : $avg_commits commits/jour

"@
}

# Ajouter le footer
$content += @"

---
_Rapport généré automatiquement par generate_time_tracking.ps1_
_Basé sur l'analyse Git des commits du projet_
"@

# Écrire le fichier
$content | Out-File -FilePath $OUTPUT_FILE -Encoding UTF8

# Vérifier que le fichier a été créé
if (Test-Path $OUTPUT_FILE) {
    Write-Host "✅ Fichier généré : $OUTPUT_FILE"
    Write-Host "   Commits analysés : $total_commits"
    Write-Host "   Contributeurs : $($author_stats.Count)"
    Get-Item $OUTPUT_FILE | Select-Object Name, Length
    exit 0
}
else {
    Write-Host "❌ ERREUR: Le fichier n'a pas été créé"
    exit 1
}
