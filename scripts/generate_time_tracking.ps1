# Script de génération automatique du suivi de temps
# Analyse tous les commits Git et génère un rapport de facturation

param(
    [string]$OutputFile = "SUIVI_TEMPS_FACTURATION.md",
    [switch]$IncludeAllBranches = $true
)

Write-Host "Analyse des commits Git..." -ForegroundColor Cyan

# Récupérer tous les commits de toutes les branches (y compris locaux)
Write-Host "Recherche des commits Git (branches distantes et locales)..." -ForegroundColor Cyan

$gitCmd = if ($IncludeAllBranches) {
    'git log --pretty=format:"%ad|%an|%s|%h" --date=format:"%Y-%m-%d %H:%M" --all --no-merges'
} else {
    'git log --pretty=format:"%ad|%an|%s|%h" --date=format:"%Y-%m-%d %H:%M" --no-merges'
}

$commits = Invoke-Expression $gitCmd

# Récupérer aussi les commits locaux non pushés (reflog)
Write-Host "Recherche des commits locaux (reflog)..." -ForegroundColor Cyan
$reflogCmd = 'git reflog --pretty=format:"%gd|%an|%gs|%h" --date=format:"%Y-%m-%d %H:%M" --all'
$reflogCommits = Invoke-Expression $reflogCmd

# Parser les commits du reflog (format différent)
$localCommits = @()
foreach ($reflogCommit in $reflogCommits) {
    if ($reflogCommit -match '^([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)$') {
        $ref = $matches[1]
        $author = $matches[2]
        $message = $matches[3]
        $hash = $matches[4]
        
        # Extraire la date du reflog (format: HEAD@{2025-12-01 10:30:00})
        if ($ref -match '@\{([^}]+)\}') {
            $dateTimeStr = $matches[1]
            try {
                $dateTime = [DateTime]::Parse($dateTimeStr)
                $datePart = $dateTime.ToString("yyyy-MM-dd")
                $timePart = $dateTime.ToString("HH:mm")
                
                $localCommits += [PSCustomObject]@{
                    Date = $datePart
                    Time = $timePart
                    DateTime = "$datePart $timePart"
                    Author = $author
                    Message = $message
                    Hash = $hash
                    Source = "local"
                }
            } catch {
                # Ignorer les entrées invalides
            }
        }
    }
}

# Combiner les commits distants et locaux
$allCommits = @()
if ($commits) {
    foreach ($commit in $commits) {
        $parts = $commit -split '\|'
        if ($parts.Count -ge 4) {
            $dateTime = $parts[0]
            $author = $parts[1]
            $message = $parts[2]
            $hash = $parts[3]
            
            $datePart = $dateTime -split ' ' | Select-Object -First 1
            $timePart = $dateTime -split ' ' | Select-Object -Last 1
            
            $allCommits += [PSCustomObject]@{
                Date = $datePart
                Time = $timePart
                DateTime = $dateTime
                Author = $author
                Message = $message
                Hash = $hash
                Source = "remote"
            }
        }
    }
}

# Ajouter les commits locaux (éviter les doublons)
foreach ($localCommit in $localCommits) {
    $isDuplicate = $allCommits | Where-Object { 
        $_.Hash -eq $localCommit.Hash -or 
        ($_.DateTime -eq $localCommit.DateTime -and $_.Message -eq $localCommit.Message)
    }
    if (-not $isDuplicate) {
        $allCommits += $localCommit
    }
}

if ($allCommits.Count -eq 0) {
    Write-Host "ERREUR: Aucun commit trouve" -ForegroundColor Red
    exit 1
}

Write-Host "OK: $($allCommits.Count) commits trouves ($($commits.Count) distants, $($localCommits.Count) locaux)" -ForegroundColor Green

# Utiliser les commits déjà parsés
$parsedCommits = $allCommits

# Grouper par jour (trier par date croissante pour avoir le premier jour en premier)
$commitsByDay = $parsedCommits | Group-Object -Property Date | Sort-Object Name

Write-Host "Generation du rapport..." -ForegroundColor Cyan

# Fonction pour estimer le temps passé (version améliorée et réaliste)
function Estimate-TimeSpent {
    param(
        [array]$DayCommits
    )
    
    if ($DayCommits.Count -eq 0) { return 0 }
    
    # Trier par heure
    $sorted = $DayCommits | Sort-Object { 
        try {
            [DateTime]::ParseExact($_.DateTime, "yyyy-MM-dd HH:mm", $null)
        } catch {
            [DateTime]::MinValue
        }
    }
    
    if ($sorted.Count -eq 0) { return 0 }
    
    $first = $sorted[0]
    $last = $sorted[-1]
    
    try {
        $startTime = [DateTime]::ParseExact($first.DateTime, "yyyy-MM-dd HH:mm", $null)
        $endTime = [DateTime]::ParseExact($last.DateTime, "yyyy-MM-dd HH:mm", $null)
        
        # Vérifier si c'est un week-end
        $dayOfWeek = $startTime.DayOfWeek
        $isWeekend = ($dayOfWeek -eq [DayOfWeek]::Saturday) -or ($dayOfWeek -eq [DayOfWeek]::Sunday)
        
        # Calculer les périodes d'activité réelles
        $activeSessions = @()
        $currentSessionStart = $null
        $lastCommitTime = $null
        
        foreach ($commit in $sorted) {
            try {
                $commitTime = [DateTime]::ParseExact($commit.DateTime, "yyyy-MM-dd HH:mm", $null)
                
                if ($null -eq $currentSessionStart) {
                    $currentSessionStart = $commitTime
                    $lastCommitTime = $commitTime
                    continue
                }
                
                # Calculer le temps entre ce commit et le précédent
                $gap = ($commitTime - $lastCommitTime).TotalMinutes
                
                # Si gap > 2 heures, c'est une nouvelle session
                if ($gap -gt 120) {
                    # Fermer la session précédente
                    if ($null -ne $currentSessionStart) {
                        $sessionDuration = ($lastCommitTime - $currentSessionStart).TotalHours
                        # Ajouter 30 min de travail effectif après le dernier commit
                        $sessionDuration += 0.5
                        if ($sessionDuration -gt 0) {
                            $activeSessions += $sessionDuration
                        }
                    }
                    # Nouvelle session
                    $currentSessionStart = $commitTime
                }
                
                $lastCommitTime = $commitTime
            } catch {
                # Ignorer les commits avec date invalide
                continue
            }
        }
        
        # Fermer la dernière session
        if ($null -ne $currentSessionStart -and $null -ne $lastCommitTime) {
            $sessionDuration = ($lastCommitTime - $currentSessionStart).TotalHours
            # Ajouter 30 min de travail effectif après le dernier commit
            $sessionDuration += 0.5
            if ($sessionDuration -gt 0) {
                $activeSessions += $sessionDuration
            }
        }
        
        # Si on n'a pas détecté de sessions (tous les commits sont proches), estimer différemment
        if ($activeSessions.Count -eq 0) {
            # Calculer la durée totale
            $totalDuration = ($endTime - $startTime).TotalHours
            
            # Si la durée est très courte (< 1h) mais beaucoup de commits, c'est une session intense
            if ($totalDuration -lt 1 -and $DayCommits.Count -gt 5) {
                # Session intense : 1-2h selon le nombre de commits
                $estimated = [Math]::Min(2, 0.5 + ($DayCommits.Count * 0.15))
            } elseif ($totalDuration -lt 2) {
                # Session courte : durée réelle + 30 min
                $estimated = $totalDuration + 0.5
            } else {
                # Session normale : prendre 60-70% de la durée (on ne code pas en continu)
                $estimated = $totalDuration * 0.65
            }
        } else {
            # Somme des sessions actives
            $estimated = ($activeSessions | Measure-Object -Sum).Sum
        }
        
        # Ajuster selon le nombre de commits (plus de commits = plus de travail effectif)
        # Mais avec un effet décroissant
        $commitBonus = [Math]::Min(2, $DayCommits.Count * 0.1)
        $estimated += $commitBonus
        
        # Ajustement week-end (généralement moins de temps)
        if ($isWeekend) {
            $estimated = $estimated * 0.8
        }
        
        # Plafonner de manière plus réaliste
        # Maximum 10h par jour (très rare)
        $estimated = [Math]::Min(10, $estimated)
        
        # Minimum 0.5h si il y a des commits
        $estimated = [Math]::Max(0.5, $estimated)
        
        return [Math]::Round($estimated, 1)
    } catch {
        # Fallback : estimation basée sur le nombre de commits
        # En moyenne 15-20 min par commit
        $estimated = $DayCommits.Count * 0.25
        return [Math]::Min(8, [Math]::Round($estimated, 1))
    }
}

# Fonction pour catégoriser les commits
function Categorize-Commit {
    param([string]$Message)
    
    $messageLower = $Message.ToLower()
    
    if ($messageLower -match "fix|bug|correction|résol|erreur|problème") {
        return "Correction"
    } elseif ($messageLower -match "feat|ajout|nouveau|add|implement") {
        return "Développement"
    } elseif ($messageLower -match "test|debug") {
        return "Test"
    } elseif ($messageLower -match "doc|documentation|readme|guide") {
        return "Documentation"
    } elseif ($messageLower -match "refactor|nettoyage|cleanup|optimis") {
        return "Refactoring"
    } elseif ($messageLower -match "deploy|déploiement|migration|chore") {
        return "Déploiement"
    } else {
        return "Autre"
    }
}

# Analyser chaque jour
$dailyReports = @()
$totalHours = 0
$categoryStats = @{
    "Développement" = 0
    "Correction" = 0
    "Test" = 0
    "Documentation" = 0
    "Refactoring" = 0
    "Déploiement" = 0
    "Autre" = 0
}

foreach ($dayGroup in $commitsByDay) {
    $date = $dayGroup.Name
    $dayCommits = $dayGroup.Group | Sort-Object { [DateTime]::ParseExact($_.DateTime, "yyyy-MM-dd HH:mm", $null) }
    
    $firstCommit = $dayCommits[0]
    $lastCommit = $dayCommits[-1]
    
    $estimatedHours = Estimate-TimeSpent -DayCommits $dayCommits
    $totalHours += $estimatedHours
    
    # Catégoriser les commits
    $categories = @{}
    $advances = @()
    $fixes = @()
    $deployments = @()
    $tests = @()
    
    foreach ($commit in $dayCommits) {
        $category = Categorize-Commit -Message $commit.Message
        if (-not $categories.ContainsKey($category)) {
            $categories[$category] = 0
        }
        $categories[$category]++
        $categoryStats[$category] += $estimatedHours / $dayCommits.Count
        
        # Extraire les informations
        if ($commit.Message -match "feat|ajout|nouveau|add|implement|amélioration") {
            $advances += $commit.Message
        }
        if ($commit.Message -match "fix|correction|résol|erreur|problème|bug") {
            $fixes += $commit.Message
        }
        if ($commit.Message -match "deploy|déploiement|migration|chore.*déploiement") {
            $deployments += $commit.Message
        }
        if ($commit.Message -match "test|debug|script.*test") {
            $tests += $commit.Message
        }
    }
    
    $dailyReports += [PSCustomObject]@{
        Date = $date
        FirstCommit = $firstCommit.Time
        LastCommit = $lastCommit.Time
        CommitCount = $dayCommits.Count
        EstimatedHours = $estimatedHours
        Categories = $categories
        Advances = $advances
        Fixes = $fixes
        Deployments = $deployments
        Tests = $tests
        Commits = $dayCommits
    }
}

# Générer le document Markdown
$mdContent = @"
# Suivi du Temps - Projet OTT
## Journal de travail pour facturation (Genere automatiquement)

**Période analysée** : $($commitsByDay[0].Name) - $($commitsByDay[-1].Name)  
**Développeur** : $($parsedCommits[0].Author)  
**Projet** : OTT - Dispositif Médical IoT  
**Total commits analysés** : $($parsedCommits.Count)  
**Branches analysées** : $(if ($IncludeAllBranches) { "Toutes" } else { "Main uniquement" })

---

## Tableau Recapitulatif

| Date | Heures | Commits | Développement | Correction | Test | Documentation | Refactoring | Déploiement |
|------|--------|---------|---------------|------------|------|----------------|-------------|-------------|
"@

foreach ($report in $dailyReports) {
    $dev = if ($report.Categories.ContainsKey("Développement")) { $report.Categories["Développement"] } else { 0 }
    $fix = if ($report.Categories.ContainsKey("Correction")) { $report.Categories["Correction"] } else { 0 }
    $test = if ($report.Categories.ContainsKey("Test")) { $report.Categories["Test"] } else { 0 }
    $doc = if ($report.Categories.ContainsKey("Documentation")) { $report.Categories["Documentation"] } else { 0 }
    $ref = if ($report.Categories.ContainsKey("Refactoring")) { $report.Categories["Refactoring"] } else { 0 }
    $dep = if ($report.Categories.ContainsKey("Déploiement")) { $report.Categories["Déploiement"] } else { 0 }
    
    $mdContent += "`n| $($report.Date) | ~$($report.EstimatedHours)h | $($report.CommitCount) | $dev | $fix | $test | $doc | $ref | $dep |"
}

$mdContent += @"

**Total** | **~$([Math]::Round($totalHours, 1))h** | **$($parsedCommits.Count)** | **$([Math]::Round($categoryStats['Développement'], 1))** | **$([Math]::Round($categoryStats['Correction'], 1))** | **$([Math]::Round($categoryStats['Test'], 1))** | **$([Math]::Round($categoryStats['Documentation'], 1))** | **$([Math]::Round($categoryStats['Refactoring'], 1))** | **$([Math]::Round($categoryStats['Déploiement'], 1))**

---

## Detail par Jour

"@

# Ajouter le détail pour chaque jour
foreach ($report in $dailyReports) {
    $dateFormatted = [DateTime]::ParseExact($report.Date, "yyyy-MM-dd", $null).ToString("dd MMMM yyyy", [System.Globalization.CultureInfo]::new("fr-FR"))
    
    $mdContent += @"

### $dateFormatted
**Heures estimées** : ~$($report.EstimatedHours)h  
**Période** : $($report.FirstCommit) - $($report.LastCommit)  
**Nombre de commits** : $($report.CommitCount)

#### Avancées principales
"@
    
    if ($report.Advances.Count -gt 0) {
        foreach ($advance in $report.Advances | Select-Object -First 10) {
            $mdContent += "`n- [FEAT] $advance"
        }
    } else {
        $mdContent += "`n- *Aucune avancée majeure enregistrée*"
    }
    
    $mdContent += @"

#### Problèmes résolus
"@
    
    if ($report.Fixes.Count -gt 0) {
        foreach ($fix in $report.Fixes | Select-Object -First 10) {
            $mdContent += "`n- [FIX] $fix"
        }
    } else {
        $mdContent += "`n- *Aucun problème résolu enregistré*"
    }
    
    $mdContent += @"

#### Redéploiements
"@
    
    if ($report.Deployments.Count -gt 0) {
        foreach ($deploy in $report.Deployments | Select-Object -First 5) {
            $mdContent += "`n- [DEPLOY] $deploy"
        }
    } else {
        $mdContent += "`n- *Aucun redéploiement enregistré*"
    }
    
    $mdContent += @"

#### Tests
"@
    
    if ($report.Tests.Count -gt 0) {
        foreach ($test in $report.Tests | Select-Object -First 5) {
            $mdContent += "`n- [TEST] $test"
        }
    } else {
        $mdContent += "`n- *Aucun test enregistré*"
    }
    
    $mdContent += "`n`n---`n"
}

# Ajouter les statistiques globales
$mdContent += @"

## Statistiques Globales

### Répartition par activité
- **Developpement** : ~$([Math]::Round($categoryStats['Développement'], 1))h $(if ($totalHours -gt 0) { "($([Math]::Round(($categoryStats['Développement'] / $totalHours) * 100, 1))%)" } else { "(0%)" })
- **Correction** : ~$([Math]::Round($categoryStats['Correction'], 1))h $(if ($totalHours -gt 0) { "($([Math]::Round(($categoryStats['Correction'] / $totalHours) * 100, 1))%)" } else { "(0%)" })
- **Test** : ~$([Math]::Round($categoryStats['Test'], 1))h $(if ($totalHours -gt 0) { "($([Math]::Round(($categoryStats['Test'] / $totalHours) * 100, 1))%)" } else { "(0%)" })
- **Documentation** : ~$([Math]::Round($categoryStats['Documentation'], 1))h $(if ($totalHours -gt 0) { "($([Math]::Round(($categoryStats['Documentation'] / $totalHours) * 100, 1))%)" } else { "(0%)" })
- **Refactoring** : ~$([Math]::Round($categoryStats['Refactoring'], 1))h $(if ($totalHours -gt 0) { "($([Math]::Round(($categoryStats['Refactoring'] / $totalHours) * 100, 1))%)" } else { "(0%)" })
- **Deploiement** : ~$([Math]::Round($categoryStats['Déploiement'], 1))h $(if ($totalHours -gt 0) { "($([Math]::Round(($categoryStats['Déploiement'] / $totalHours) * 100, 1))%)" } else { "(0%)" })

### Temps total estimé : ~$([Math]::Round($totalHours, 1)) heures

### Nombre de jours travaillés : $($dailyReports.Count)

### Moyenne par jour : ~$(if ($dailyReports.Count -gt 0) { [Math]::Round($totalHours / $dailyReports.Count, 1) } else { 0 })h

---

## Notes pour facturation

### Méthodologie d'estimation
- Estimation basée sur l'analyse des commits Git de **toutes les branches**
- Calcul de la durée entre premier et dernier commit de la journée
- Ajustement selon le nombre de commits (plus de commits = plus de temps)
- Plafond de 12h par jour maximum
- Catégorisation automatique des commits

### Catégories de travail
1. **Développement** : Nouvelles fonctionnalités (feat, ajout, nouveau)
2. **Correction** : Bug fixes, résolution problèmes (fix, bug, erreur)
3. **Test** : Tests unitaires, tests d'intégration (test, debug)
4. **Documentation** : Rédaction, mise à jour docs (doc, documentation)
5. **Refactoring** : Restructuration code (refactor, nettoyage)
6. **Déploiement** : Configuration, migrations, redéploiements (deploy, migration)

### Recommandations
- Ce document est généré automatiquement à partir des commits Git
- Les estimations peuvent être ajustées manuellement si nécessaire
- Pour facturation précise, combiner avec un système de suivi temps réel (Toggl, etc.)
- Les commits sont analysés de toutes les branches pour une vue complète

---

**Derniere generation** : $(Get-Date -Format "dd/MM/yyyy HH:mm")  
**Source** : Analyse automatique des commits Git du projet  
**Script** : `scripts/generate_time_tracking.ps1`
"@

# Écrire le fichier avec encodage UTF8 sans BOM
$projectRoot = (Resolve-Path .).Path
$outputPath = Join-Path $projectRoot $OutputFile
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllLines($outputPath, $mdContent, $utf8NoBom)

# Copier aussi dans public/ pour faciliter l'accès frontend
$publicPath = Join-Path $projectRoot "public\$OutputFile"
$publicDir = Split-Path $publicPath -Parent
if (-not (Test-Path $publicDir)) {
    New-Item -ItemType Directory -Path $publicDir -Force | Out-Null
}
Copy-Item $outputPath -Destination $publicPath -Force

Write-Host "OK: Rapport genere : $outputPath" -ForegroundColor Green
Write-Host "OK: Copie creee dans : $publicPath" -ForegroundColor Green
if ($dailyReports.Count -gt 0) {
    Write-Host "Total estime : ~$([Math]::Round($totalHours, 1)) heures sur $($dailyReports.Count) jours" -ForegroundColor Cyan
    Write-Host "Moyenne : ~$([Math]::Round($totalHours / $dailyReports.Count, 1))h/jour" -ForegroundColor Cyan
} else {
    Write-Host "Aucun rapport genere" -ForegroundColor Yellow
}

