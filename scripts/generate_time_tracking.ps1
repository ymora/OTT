# Script de génération automatique du suivi de temps
# Analyse tous les commits Git et génère un rapport de facturation
# Version améliorée avec validation, filtrage et export

param(
    [string]$OutputFile = "SUIVI_TEMPS_FACTURATION.md",
    [switch]$IncludeAllBranches = $true,
    [string]$Author = "",  # Filtrer par auteur (optionnel)
    [string]$Since = "",   # Date de début (format: YYYY-MM-DD ou "30 days ago")
    [string]$Until = "",   # Date de fin (format: YYYY-MM-DD)
    [string[]]$Branches = @(),  # Branches spécifiques (vide = toutes)
    [switch]$ExportCsv = $false,  # Exporter aussi en CSV
    [switch]$ExportJson = $false,  # Exporter aussi en JSON
    [switch]$Verbose = $false
)

# Fonction pour logger avec niveau
function Write-Log {
    param(
        [string]$Message,
        [string]$Level = "Info"
    )
    $color = switch ($Level) {
        "Error" { "Red" }
        "Warning" { "Yellow" }
        "Success" { "Green" }
        "Info" { "Cyan" }
        default { "White" }
    }
    if ($Verbose -or $Level -eq "Error" -or $Level -eq "Success") {
        Write-Host $Message -ForegroundColor $color
    }
}

# Validation : Vérifier que Git est disponible
function Test-GitAvailable {
    try {
        $null = git --version 2>&1
        return $true
    } catch {
        return $false
    }
}

# Validation : Vérifier que nous sommes dans un dépôt Git
function Test-GitRepository {
    try {
        $null = git rev-parse --git-dir 2>&1
        return $true
    } catch {
        return $false
    }
}

# Fonction pour parser un commit (factorisation du code)
function Parse-Commit {
    param(
        [string]$CommitLine,
        [string]$Source = "remote"
    )
    
    $parts = $CommitLine -split '\|'
    if ($parts.Count -lt 4) {
        return $null
    }
    
    $dateTime = $parts[0]
    $author = $parts[1]
    $message = $parts[2]
    $hash = $parts[3]
    
    # Extraire date et heure
    $datePart = $dateTime -split ' ' | Select-Object -First 1
    $timePart = $dateTime -split ' ' | Select-Object -Last 1
    
    # Validation de la date
    try {
        $testDate = [DateTime]::ParseExact("$datePart $timePart", "yyyy-MM-dd HH:mm", $null)
    } catch {
        Write-Log "⚠️ Date invalide ignorée: $dateTime" "Warning"
        return $null
    }
    
    return [PSCustomObject]@{
        Date = $datePart
        Time = $timePart
        DateTime = $dateTime
        Author = $author
        Message = $message
        Hash = $hash
        Source = $Source
    }
}

# Fonction pour construire la commande Git avec filtres
function Build-GitCommand {
    param(
        [string]$BaseCommand,
        [string]$AuthorFilter = "",
        [string]$SinceFilter = "",
        [string]$UntilFilter = "",
        [string[]]$BranchFilter = @()
    )
    
    $cmd = $BaseCommand
    
    # Ajouter filtre auteur
    if ($AuthorFilter) {
        $cmd += " --author=`"$AuthorFilter`""
    }
    
    # Ajouter filtre date début
    if ($SinceFilter) {
        $cmd += " --since=`"$SinceFilter`""
    }
    
    # Ajouter filtre date fin
    if ($UntilFilter) {
        $cmd += " --until=`"$UntilFilter`""
    }
    
    # Ajouter filtres de branches
    if ($BranchFilter.Count -gt 0) {
        $cmd = $cmd -replace '--all', ''
        $cmd = $cmd -replace '--branches', ''
        foreach ($branch in $BranchFilter) {
            $cmd += " $branch"
        }
    }
    
    return $cmd
}

# ============================================
# VALIDATION INITIALE
# ============================================

Write-Log "🔍 Validation de l'environnement..." "Info"

if (-not (Test-GitAvailable)) {
    Write-Log "❌ ERREUR: Git n'est pas disponible sur ce système" "Error"
    Write-Log "   Veuillez installer Git: https://git-scm.com/downloads" "Error"
    exit 1
}

if (-not (Test-GitRepository)) {
    Write-Log "❌ ERREUR: Ce répertoire n'est pas un dépôt Git" "Error"
    Write-Log "   Veuillez exécuter ce script depuis la racine du projet" "Error"
    exit 1
}

Write-Log "✅ Git disponible et dépôt valide" "Success"

# ============================================
# RÉCUPÉRATION DES COMMITS
# ============================================

Write-Log "📊 Analyse des commits Git..." "Info"

# Construire la commande de base
$baseFormat = '--pretty=format:"%ad|%an|%s|%h" --date=format:"%Y-%m-%d %H:%M" --no-merges'
$baseCmd = if ($IncludeAllBranches) {
    "git log $baseFormat --all"
} else {
    "git log $baseFormat"
}

# Récupérer tous les commits de toutes les branches (distants)
Write-Log "🔍 Recherche des commits Git (branches distantes)..." "Info"
$gitCmd = Build-GitCommand -BaseCommand $baseCmd -AuthorFilter $Author -SinceFilter $Since -UntilFilter $Until -BranchFilter $Branches

try {
    $commits = Invoke-Expression $gitCmd 2>&1
    if ($LASTEXITCODE -ne 0 -and $commits -match "fatal:") {
        Write-Log "⚠️ Aucun commit trouvé avec les filtres spécifiés" "Warning"
        $commits = @()
    }
} catch {
    Write-Log "⚠️ Erreur lors de la récupération des commits distants: $_" "Warning"
    $commits = @()
}

# Récupérer les commits locaux non pushés
Write-Log "🔍 Recherche des commits locaux non pushés..." "Info"
$localBaseCmd = "git log $baseFormat --branches --not --remotes"
$localCommitsCmd = Build-GitCommand -BaseCommand $localBaseCmd -AuthorFilter $Author -SinceFilter $Since -UntilFilter $Until -BranchFilter $Branches

try {
    $localCommitsRaw = Invoke-Expression $localCommitsCmd 2>&1
    if ($LASTEXITCODE -ne 0) {
        $localCommitsRaw = @()
    }
} catch {
    Write-Log "⚠️ Erreur lors de la récupération des commits locaux: $_" "Warning"
    $localCommitsRaw = @()
}

# Parser les commits locaux
$localCommits = @()
if ($localCommitsRaw) {
    foreach ($commit in $localCommitsRaw) {
        if ($commit -match "fatal:") { continue }
        $parsed = Parse-Commit -CommitLine $commit -Source "local"
        if ($parsed) {
            $localCommits += $parsed
        }
    }
}

# Récupérer aussi les commits du reflog (pour les commits qui ne sont plus dans aucune branche)
Write-Log "🔍 Recherche des commits orphelins (reflog)..." "Info"
$reflogCmd = 'git reflog --pretty=format:"%gd|%an|%gs|%h" --date=format:"%Y-%m-%d %H:%M" --all'

try {
    $reflogCommits = Invoke-Expression $reflogCmd 2>&1
    if ($LASTEXITCODE -ne 0) {
        $reflogCommits = @()
    }
} catch {
    Write-Log "⚠️ Erreur lors de la récupération du reflog: $_" "Warning"
    $reflogCommits = @()
}

# Parser les commits du reflog (format différent)
$orphanCommits = @()
$processedHashes = @{}
foreach ($reflogCommit in $reflogCommits) {
    if ($reflogCommit -match "fatal:") { continue }
    
    if ($reflogCommit -match '^([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)$') {
        $ref = $matches[1]
        $author = $matches[2]
        $message = $matches[3]
        $hash = $matches[4]
        
        # Ignorer si déjà traité
        if ($processedHashes.ContainsKey($hash)) { continue }
        
        # Extraire la date du reflog (format: HEAD@{2025-12-01 10:30:00})
        if ($ref -match '@\{([^}]+)\}') {
            $dateTimeStr = $matches[1]
            try {
                $dateTime = [DateTime]::Parse($dateTimeStr)
                $datePart = $dateTime.ToString("yyyy-MM-dd")
                $timePart = $dateTime.ToString("HH:mm")
                
                # Appliquer les filtres de date si spécifiés
                $commitDate = [DateTime]::ParseExact("$datePart $timePart", "yyyy-MM-dd HH:mm", $null)
                $shouldInclude = $true
                
                if ($Since) {
                    $sinceDate = if ($Since -match "^\d{4}-\d{2}-\d{2}$") {
                        [DateTime]::ParseExact($Since, "yyyy-MM-dd", $null)
                    } else {
                        # Format relatif comme "30 days ago"
                        $null = git log --since="$Since" --format="%ad" --date=format:"%Y-%m-%d" -1
                        [DateTime]::Now.AddDays(-30)  # Fallback
                    }
                    if ($commitDate -lt $sinceDate) { $shouldInclude = $false }
                }
                
                if ($Until -and $shouldInclude) {
                    $untilDate = [DateTime]::ParseExact($Until, "yyyy-MM-dd", $null)
                    if ($commitDate -gt $untilDate) { $shouldInclude = $false }
                }
                
                if ($Author -and $shouldInclude) {
                    if ($author -notmatch $Author) { $shouldInclude = $false }
                }
                
                if ($shouldInclude) {
                    $orphanCommits += [PSCustomObject]@{
                        Date = $datePart
                        Time = $timePart
                        DateTime = "$datePart $timePart"
                        Author = $author
                        Message = $message
                        Hash = $hash
                        Source = "orphan"
                    }
                    $processedHashes[$hash] = $true
                }
            } catch {
                # Ignorer les entrées invalides
            }
        }
    }
}

# Combiner les commits distants et locaux
$allCommits = @()
$allHashes = @{}

# Ajouter les commits distants
if ($commits) {
    foreach ($commit in $commits) {
        if ($commit -match "fatal:") { continue }
        $parsed = Parse-Commit -CommitLine $commit -Source "remote"
        if ($parsed -and -not $allHashes.ContainsKey($parsed.Hash)) {
            $allCommits += $parsed
            $allHashes[$parsed.Hash] = $true
        }
    }
}

# Ajouter les commits locaux non pushés (éviter les doublons)
foreach ($localCommit in $localCommits) {
    if (-not $allHashes.ContainsKey($localCommit.Hash)) {
        $allCommits += $localCommit
        $allHashes[$localCommit.Hash] = $true
    }
}

# Ajouter les commits orphelins du reflog (éviter les doublons)
foreach ($orphanCommit in $orphanCommits) {
    if (-not $allHashes.ContainsKey($orphanCommit.Hash)) {
        $allCommits += $orphanCommit
        $allHashes[$orphanCommit.Hash] = $true
    }
}

if ($allCommits.Count -eq 0) {
    Write-Log "❌ ERREUR: Aucun commit trouvé avec les critères spécifiés" "Error"
    if ($Author) { Write-Log "   Auteur filtré: $Author" "Info" }
    if ($Since) { Write-Log "   Depuis: $Since" "Info" }
    if ($Until) { Write-Log "   Jusqu'à: $Until" "Info" }
    exit 1
}

$remoteCount = ($allCommits | Where-Object { $_.Source -eq "remote" }).Count
$localCount = ($allCommits | Where-Object { $_.Source -eq "local" }).Count
$orphanCount = ($allCommits | Where-Object { $_.Source -eq "orphan" }).Count
Write-Log "✅ $($allCommits.Count) commits trouvés ($remoteCount distants, $localCount locaux non pushés, $orphanCount orphelins)" "Success"

# Utiliser les commits déjà parsés
$parsedCommits = $allCommits

# Grouper par jour (trier par date croissante pour avoir le premier jour en premier)
$commitsByDay = $parsedCommits | Group-Object -Property Date | Sort-Object Name

Write-Log "📝 Génération du rapport..." "Info"

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

# Fonction pour catégoriser les commits (version améliorée V2 avec UI/UX et emojis)
function Categorize-Commit {
    param([string]$Message)
    
    $messageLower = $Message.ToLower()
    
    # Ordre important : vérifier les patterns les plus spécifiques en premier
    
    # UI/UX - Priorité haute pour les modifications visuelles (emojis 🎨🗺️📊🔋etc)
    if ($messageLower -match "(🎨|🗺️|📊|🔋|🟢|🔴|🟠|ui|ux|interface|design|visuel|carte|accordéon|card|icon|amélioration.*vue|réorganisation|agencement)" -and
        $messageLower -notmatch "(fix|bug|test)") {
        return "UI/UX"
    # Nettoyage/Optimisation - Audit, code mort, suppression (emojis 🗑️🧹✨)
    } elseif ($messageLower -match "(🗑️|🧹|✨|nettoyage|cleanup|suppression|audit|code.*mort|optimis|optimize|performance|amélioration.*perf)") {
        return "Optimisation"
    # Corrections - Bugs et problèmes (emojis 🔧🐛)
    } elseif ($messageLower -match "(🔧|🐛|fix|bug|correction|résol|erreur|problème|patch|hotfix|resolve|issue)" -and 
        $messageLower -notmatch "test.*fix") {
        return "Correction"
    # Développement - Nouvelles fonctionnalités (emojis ✨🚀⚡)
    } elseif ($messageLower -match "(✨|🚀|⚡|feat|feature|ajout|nouveau|add|implement|création|create|new)" -and
              $messageLower -notmatch "test.*feat") {
        return "Développement"
    # Tests - Debug et tests (emojis 🧪🔍)
    } elseif ($messageLower -match "(🧪|🔍|test|spec|unittest|integration|e2e|debug|testing)" -and
              $messageLower -notmatch "(feat|fix).*test") {
        return "Test"
    # Documentation - Docs et commentaires (emojis 📝📚)
    } elseif ($messageLower -match "(📝|📚|doc|documentation|readme|guide|comment|changelog|rapport|md$)" -and
              $messageLower -notmatch "test.*doc") {
        return "Documentation"
    # Refactoring - Restructuration (emojis ♻️🔨)
    } elseif ($messageLower -match "(♻️|🔨|refactor|refactoring|restructure|reorganize|consolidation)") {
        return "Refactoring"
    # Déploiement - CI/CD et releases (emojis 🚀📦)
    } elseif ($messageLower -match "(🚀|📦|deploy|déploiement|migration|chore.*deploy|release|build|ci|cd|pipeline)") {
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
    "UI/UX" = 0
    "Optimisation" = 0
    "Autre" = 0
}

foreach ($dayGroup in $commitsByDay) {
    $date = $dayGroup.Name
    $dayCommits = $dayGroup.Group | Sort-Object { 
        try {
            [DateTime]::ParseExact($_.DateTime, "yyyy-MM-dd HH:mm", $null)
        } catch {
            [DateTime]::MinValue
        }
    }
    
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
        if ($commit.Message -match "feat|ajout|nouveau|add|implement|amélioration|feature") {
            $advances += $commit.Message
        }
        if ($commit.Message -match "fix|correction|résol|erreur|problème|bug|patch") {
            $fixes += $commit.Message
        }
        if ($commit.Message -match "deploy|déploiement|migration|chore.*déploiement|release") {
            $deployments += $commit.Message
        }
        if ($commit.Message -match "test|debug|script.*test|spec") {
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
## Journal de travail pour facturation (Généré automatiquement)

**Période analysée** : $($commitsByDay[0].Name) - $($commitsByDay[-1].Name)  
**Développeur** : $($parsedCommits[0].Author)  
**Projet** : OTT - Dispositif Médical IoT  
**Total commits analysés** : $($parsedCommits.Count)  
**Branches analysées** : $(if ($IncludeAllBranches) { "Toutes" } else { "Main uniquement" })
$(if ($Author) { "**Auteur filtré** : $Author  " })
$(if ($Since) { "**Depuis** : $Since  " })
$(if ($Until) { "**Jusqu'à** : $Until  " })

---

## Tableau Récapitulatif

| Date | Heures | Commits | Développement | Correction | Test | Documentation | Refactoring | Déploiement | UI/UX | Optimisation |
|------|--------|---------|---------------|------------|------|----------------|-------------|-------------|-------|--------------|
"@

foreach ($report in $dailyReports) {
    $dev = if ($report.Categories.ContainsKey("Développement")) { $report.Categories["Développement"] } else { 0 }
    $fix = if ($report.Categories.ContainsKey("Correction")) { $report.Categories["Correction"] } else { 0 }
    $test = if ($report.Categories.ContainsKey("Test")) { $report.Categories["Test"] } else { 0 }
    $doc = if ($report.Categories.ContainsKey("Documentation")) { $report.Categories["Documentation"] } else { 0 }
    $ref = if ($report.Categories.ContainsKey("Refactoring")) { $report.Categories["Refactoring"] } else { 0 }
    $dep = if ($report.Categories.ContainsKey("Déploiement")) { $report.Categories["Déploiement"] } else { 0 }
    $uiux = if ($report.Categories.ContainsKey("UI/UX")) { $report.Categories["UI/UX"] } else { 0 }
    $optim = if ($report.Categories.ContainsKey("Optimisation")) { $report.Categories["Optimisation"] } else { 0 }
    
    $mdContent += "`n| $($report.Date) | ~$($report.EstimatedHours)h | $($report.CommitCount) | $dev | $fix | $test | $doc | $ref | $dep | $uiux | $optim |"
}

$mdContent += @"

**Total** | **~$([Math]::Round($totalHours, 1))h** | **$($parsedCommits.Count)** | **$([Math]::Round($categoryStats['Développement'], 1))** | **$([Math]::Round($categoryStats['Correction'], 1))** | **$([Math]::Round($categoryStats['Test'], 1))** | **$([Math]::Round($categoryStats['Documentation'], 1))** | **$([Math]::Round($categoryStats['Refactoring'], 1))** | **$([Math]::Round($categoryStats['Déploiement'], 1))** | **$([Math]::Round($categoryStats['UI/UX'], 1))** | **$([Math]::Round($categoryStats['Optimisation'], 1))**

---

## Détail par Jour

"@

# Ajouter le détail pour chaque jour
foreach ($report in $dailyReports) {
    try {
        $dateFormatted = [DateTime]::ParseExact($report.Date, "yyyy-MM-dd", $null).ToString("dd MMMM yyyy", [System.Globalization.CultureInfo]::new("fr-FR"))
    } catch {
        $dateFormatted = $report.Date
    }
    
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
- **Développement** : ~$([Math]::Round($categoryStats['Développement'], 1))h $(if ($totalHours -gt 0) { "($([Math]::Round(($categoryStats['Développement'] / $totalHours) * 100, 1))%)" } else { "(0%)" })
- **Correction** : ~$([Math]::Round($categoryStats['Correction'], 1))h $(if ($totalHours -gt 0) { "($([Math]::Round(($categoryStats['Correction'] / $totalHours) * 100, 1))%)" } else { "(0%)" })
- **Test** : ~$([Math]::Round($categoryStats['Test'], 1))h $(if ($totalHours -gt 0) { "($([Math]::Round(($categoryStats['Test'] / $totalHours) * 100, 1))%)" } else { "(0%)" })
- **Documentation** : ~$([Math]::Round($categoryStats['Documentation'], 1))h $(if ($totalHours -gt 0) { "($([Math]::Round(($categoryStats['Documentation'] / $totalHours) * 100, 1))%)" } else { "(0%)" })
- **Refactoring** : ~$([Math]::Round($categoryStats['Refactoring'], 1))h $(if ($totalHours -gt 0) { "($([Math]::Round(($categoryStats['Refactoring'] / $totalHours) * 100, 1))%)" } else { "(0%)" })
- **Déploiement** : ~$([Math]::Round($categoryStats['Déploiement'], 1))h $(if ($totalHours -gt 0) { "($([Math]::Round(($categoryStats['Déploiement'] / $totalHours) * 100, 1))%)" } else { "(0%)" })
- **UI/UX** : ~$([Math]::Round($categoryStats['UI/UX'], 1))h $(if ($totalHours -gt 0) { "($([Math]::Round(($categoryStats['UI/UX'] / $totalHours) * 100, 1))%)" } else { "(0%)" })
- **Optimisation** : ~$([Math]::Round($categoryStats['Optimisation'], 1))h $(if ($totalHours -gt 0) { "($([Math]::Round(($categoryStats['Optimisation'] / $totalHours) * 100, 1))%)" } else { "(0%)" })

### Temps total estimé : ~$([Math]::Round($totalHours, 1)) heures

### Nombre de jours travaillés : $($dailyReports.Count)

### Moyenne par jour : ~$(if ($dailyReports.Count -gt 0) { [Math]::Round($totalHours / $dailyReports.Count, 1) } else { 0 })h

---

## Notes pour facturation

### Méthodologie d'estimation
- Estimation basée sur l'analyse des commits Git de **toutes les branches**
- Calcul de la durée entre premier et dernier commit de la journée
- Ajustement selon le nombre de commits (plus de commits = plus de temps)
- Plafond de 10h par jour maximum
- Catégorisation automatique des commits

### Catégories de travail
1. **Développement** : Nouvelles fonctionnalités (feat, ajout, nouveau, ✨🚀)
2. **Correction** : Bug fixes, résolution problèmes (fix, bug, erreur, 🔧🐛)
3. **Test** : Tests unitaires, tests d'intégration (test, debug, 🧪🔍)
4. **Documentation** : Rédaction, mise à jour docs (doc, documentation, 📝📚)
5. **Refactoring** : Restructuration code (refactor, nettoyage, ♻️🔨)
6. **Déploiement** : Configuration, migrations, redéploiements (deploy, migration, 🚀📦)
7. **UI/UX** : Améliorations visuelles, design (carte, accordéons, icônes, 🎨🗺️📊)
8. **Optimisation** : Nettoyage code, audit, performance (🗑️🧹✨)

### Recommandations
- Ce document est généré automatiquement à partir des commits Git
- Les estimations peuvent être ajustées manuellement si nécessaire
- Pour facturation précise, combiner avec un système de suivi temps réel (Toggl, etc.)
- Les commits sont analysés de toutes les branches pour une vue complète

---

**Dernière génération** : $(Get-Date -Format "dd/MM/yyyy HH:mm")  
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

Write-Log "✅ Rapport généré : $outputPath" "Success"
Write-Log "✅ Copie créée dans : $publicPath" "Success"

# Export CSV si demandé
if ($ExportCsv) {
    $csvPath = $outputPath -replace '\.md$', '.csv'
    $csvLines = @("Date,Heures,Commits,Développement,Correction,Test,Documentation,Refactoring,Déploiement,UI/UX,Optimisation")
    foreach ($report in $dailyReports) {
        $dev = if ($report.Categories.ContainsKey("Développement")) { $report.Categories["Développement"] } else { 0 }
        $fix = if ($report.Categories.ContainsKey("Correction")) { $report.Categories["Correction"] } else { 0 }
        $test = if ($report.Categories.ContainsKey("Test")) { $report.Categories["Test"] } else { 0 }
        $doc = if ($report.Categories.ContainsKey("Documentation")) { $report.Categories["Documentation"] } else { 0 }
        $ref = if ($report.Categories.ContainsKey("Refactoring")) { $report.Categories["Refactoring"] } else { 0 }
        $dep = if ($report.Categories.ContainsKey("Déploiement")) { $report.Categories["Déploiement"] } else { 0 }
        $uiux = if ($report.Categories.ContainsKey("UI/UX")) { $report.Categories["UI/UX"] } else { 0 }
        $optim = if ($report.Categories.ContainsKey("Optimisation")) { $report.Categories["Optimisation"] } else { 0 }
        $csvLines += "$($report.Date),$($report.EstimatedHours),$($report.CommitCount),$dev,$fix,$test,$doc,$ref,$dep,$uiux,$optim"
    }
    [System.IO.File]::WriteAllLines($csvPath, $csvLines, $utf8NoBom)
    Write-Log "✅ Export CSV créé : $csvPath" "Success"
}

# Export JSON si demandé
if ($ExportJson) {
    $jsonPath = $outputPath -replace '\.md$', '.json'
    $jsonData = @{
        period = @{
            start = $commitsByDay[0].Name
            end = $commitsByDay[-1].Name
        }
        summary = @{
            totalCommits = $parsedCommits.Count
            totalHours = [Math]::Round($totalHours, 1)
            daysWorked = $dailyReports.Count
            averagePerDay = if ($dailyReports.Count -gt 0) { [Math]::Round($totalHours / $dailyReports.Count, 1) } else { 0 }
            categories = $categoryStats
        }
        dailyReports = $dailyReports | ForEach-Object {
            @{
                date = $_.Date
                hours = $_.EstimatedHours
                commits = $_.CommitCount
                firstCommit = $_.FirstCommit
                lastCommit = $_.LastCommit
                categories = $_.Categories
            }
        }
    }
    $jsonContent = $jsonData | ConvertTo-Json -Depth 10
    [System.IO.File]::WriteAllText($jsonPath, $jsonContent, $utf8NoBom)
    Write-Log "✅ Export JSON créé : $jsonPath" "Success"
}

if ($dailyReports.Count -gt 0) {
    Write-Log "📊 Total estimé : ~$([Math]::Round($totalHours, 1)) heures sur $($dailyReports.Count) jours" "Success"
    Write-Log "📊 Moyenne : ~$([Math]::Round($totalHours / $dailyReports.Count, 1))h/jour" "Success"
} else {
    Write-Log "⚠️ Aucun rapport généré" "Warning"
}
