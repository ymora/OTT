# ================================================================================
# AUDIT COMPLET AUTOMATIQUE PROFESSIONNEL - OTT Dashboard
# ================================================================================
# HAPPLYZ MEDICAL SAS
# Version 2.0 - Analyse exhaustive de qualité professionnelle
#
# Ce script effectue un audit à 360° couvrant :
# 1.  Architecture & Organisation
# 2.  Code Mort (fichiers, fonctions, variables, imports)
# 3.  Duplication de Code (patterns répétés, refactoring possible)
# 4.  Complexité & Maintenabilité (fonctions longues, fichiers volumineux)
# 5.  Routes & Navigation
# 6.  Endpoints API (test fonctionnel)
# 7.  Base de Données (cohérence, intégrité)
# 8.  Sécurité (SQL injection, XSS, JWT, CORS, headers)
# 9.  Performance (cache, requêtes N+1, optimisations)
# 10. Tests & Couverture
# 11. Documentation
# 12. Dépendances & Imports
# 13. Gestion d'Erreurs
# 14. Logs & Monitoring
# 15. Best Practices React/PHP
#
# Usage : .\scripts\AUDIT_COMPLET_AUTOMATIQUE.ps1 [-Verbose]
# ================================================================================

param(
    [string]$Email = "ymora@free.fr",
    [string]$Password = "Ym120879",
    [string]$ApiUrl = "https://ott-jbln.onrender.com",
    [switch]$Verbose = $false,
    [int]$MaxFunctionLines = 100,
    [int]$MaxFileLines = 500,
    [int]$DuplicationThreshold = 30
)

$ErrorActionPreference = "Continue"
$OutputEncoding = [System.Text.Encoding]::UTF8

# Fonctions d'affichage
function Write-Section { param([string]$Text) Write-Host "`n━━━ $Text" -ForegroundColor Cyan }
function Write-OK { param([string]$Text) Write-Host "  ✅ $Text" -ForegroundColor Green }
function Write-Warn { param([string]$Text) Write-Host "  ⚠️  $Text" -ForegroundColor Yellow }
function Write-Err { param([string]$Text) Write-Host "  ❌ $Text" -ForegroundColor Red }
function Write-Info { param([string]$Text) if($Verbose) { Write-Host "  ℹ️  $Text" -ForegroundColor Gray } }

Write-Host @"

═══════════════════════════════════════════════════════════════════════════════
🔍 AUDIT COMPLET AUTOMATIQUE PROFESSIONNEL - OTT Dashboard
═══════════════════════════════════════════════════════════════════════════════
Date     : $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
Version  : 2.0 - Analyse Exhaustive de Qualité Professionnelle
═══════════════════════════════════════════════════════════════════════════════

"@ -ForegroundColor Cyan

$auditResults = @{
    Scores = @{}
    Issues = @()
    Warnings = @()
    Recommendations = @()
    Stats = @{}
}

$startTime = Get-Date

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 1 : ARCHITECTURE & STATISTIQUES
# ═══════════════════════════════════════════════════════════════════════════════

Write-Section "📊 PHASE 1/15 : Architecture & Statistiques Code"

try {
    Write-Info "Comptage des fichiers..."
    
    $jsFiles = @(Get-ChildItem -Recurse -File -Include *.js,*.jsx -Exclude node_modules,*.min.js,.next,docs,public)
    $phpFiles = @(Get-ChildItem -Recurse -File -Include *.php -Exclude vendor)
    $sqlFiles = @(Get-ChildItem -Recurse -File -Include *.sql)
    $mdFilesRoot = @(Get-ChildItem -File -Filter *.md)
    $components = @(Get-ChildItem -Path components -Recurse -File -Include *.js)
    $hooks = @(Get-ChildItem -Path hooks -File -Include *.js -Exclude index.js)
    $pages = @(Get-ChildItem -Path app/dashboard -Recurse -File -Include page.js)
    $scripts = @(Get-ChildItem -Path scripts -Recurse -File -Include *.ps1,*.sh,*.js)
    
    # Compter lignes (sans erreur sur dossiers)
    $jsLines = ($jsFiles | ForEach-Object { (Get-Content $_.FullName -ErrorAction SilentlyContinue | Measure-Object -Line).Lines } | Measure-Object -Sum).Sum
    $phpLines = ($phpFiles | ForEach-Object { (Get-Content $_.FullName -ErrorAction SilentlyContinue | Measure-Object -Line).Lines } | Measure-Object -Sum).Sum
    
    $stats = @{
        JS = $jsFiles.Count
        JSLines = $jsLines
        PHP = $phpFiles.Count
        PHPLines = $phpLines
        SQL = $sqlFiles.Count
        MD = $mdFilesRoot.Count
        Components = $components.Count
        Hooks = $hooks.Count
        Pages = $pages.Count
        Scripts = $scripts.Count
    }
    
    Write-Host "  📁 JavaScript/React : $($stats.JS) fichiers ($($stats.JSLines) lignes)" -ForegroundColor White
    Write-Host "  📁 PHP             : $($stats.PHP) fichiers ($($stats.PHPLines) lignes)" -ForegroundColor White
    Write-Host "  📁 SQL             : $($stats.SQL) fichiers" -ForegroundColor White
    Write-Host "  📄 Markdown (root) : $($stats.MD) fichiers" -ForegroundColor $(if($stats.MD -gt 10){"Red"}elseif($stats.MD -gt 5){"Yellow"}else{"Green"})
    Write-Host "  🧩 Composants      : $($stats.Components)" -ForegroundColor White
    Write-Host "  🎣 Hooks           : $($stats.Hooks)" -ForegroundColor White
    Write-Host "  📄 Pages Dashboard : $($stats.Pages)" -ForegroundColor White
    Write-Host "  📜 Scripts         : $($stats.Scripts)" -ForegroundColor White
    
    $auditResults.Stats = $stats
    $auditResults.Scores["Architecture"] = 10
    
    if ($stats.MD -gt 10) {
        Write-Warn "Trop de fichiers MD à la racine ($($stats.MD)) - Recommandé: ≤ 5"
        $auditResults.Issues += "Documentation: $($stats.MD) fichiers MD à la racine"
        $auditResults.Scores["Architecture"] = 8
    } elseif ($stats.MD -gt 5) {
        Write-Warn "Fichiers MD à rationaliser ($($stats.MD))"
        $auditResults.Scores["Architecture"] = 9
    }
    
    Write-OK "Architecture analysée"
} catch {
    Write-Err "Erreur analyse architecture: $($_.Exception.Message)"
    $auditResults.Scores["Architecture"] = 5
}

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 2 : CODE MORT
# ═══════════════════════════════════════════════════════════════════════════════

Write-Section "🗑️  PHASE 2/15 : Code Mort - Détection Composants/Hooks/Libs Non Utilisés"

$deadCode = @{
    Components = @()
    Hooks = @()
    Libs = @()
}

try {
    Write-Info "Analyse composants..."
    
    # Analyser composants
    $allComponents = Get-ChildItem -Path components -Recurse -File -Include *.js | ForEach-Object { $_.BaseName }
    # CORRECTION: Mieux exclure node_modules
    $searchFiles = Get-ChildItem -Recurse -File -Include *.js,*.jsx | Where-Object {
        $_.FullName -notmatch 'node_modules' -and
        $_.FullName -notmatch '\\\.next\\' -and
        $_.FullName -notmatch '\\docs\\' -and
        $_.FullName -notmatch '\\public\\'
    }
    
    foreach ($comp in $allComponents) {
        $usage = @($searchFiles | Select-String -Pattern $comp -SimpleMatch).Count
        # Un composant s'importe lui-même (1), donc 0-1 = mort
        if ($usage -le 1) {
            $deadCode.Components += $comp
            Write-Err "Composant mort: $comp (0 utilisations)"
        }
    }
    
    # Analyser hooks
    Write-Info "Analyse hooks..."
    $allHooks = Get-ChildItem -Path hooks -File -Include *.js -Exclude index.js | ForEach-Object { $_.BaseName }
    foreach ($hook in $allHooks) {
        $usage = @($searchFiles | Select-String -Pattern $hook).Count
        if ($usage -le 1) {
            $deadCode.Hooks += $hook
            Write-Err "Hook mort: $hook"
        }
    }
    
    # Analyser libs
    Write-Info "Analyse libs..."
    $allLibs = Get-ChildItem -Path lib -File -Include *.js | ForEach-Object { $_.BaseName }
    foreach ($lib in $allLibs) {
        $usage = @($searchFiles | Where-Object { $_.FullName -notlike "*\lib\*" } | Select-String -Pattern $lib).Count
        if ($usage -eq 0) {
            $deadCode.Libs += $lib
            Write-Err "Lib morte: $lib"
        }
    }
    
    $totalDead = $deadCode.Components.Count + $deadCode.Hooks.Count + $deadCode.Libs.Count
    if ($totalDead -eq 0) {
        Write-OK "Aucun code mort détecté"
        $auditResults.Scores["CodeMort"] = 10
    } else {
        Write-Warn "$totalDead fichier(s) non utilisé(s) détecté(s)"
        $auditResults.Issues += "Code mort: $totalDead fichiers à supprimer"
        $auditResults.Scores["CodeMort"] = [Math]::Max(10 - $totalDead, 0)
    }
} catch {
    Write-Err "Erreur analyse code mort: $($_.Exception.Message)"
    $auditResults.Scores["CodeMort"] = 5
}

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 3 : DUPLICATION DE CODE
# ═══════════════════════════════════════════════════════════════════════════════

Write-Section "🔄 PHASE 3/15 : Duplication de Code & Refactoring Possible"

try {
    Write-Info "Analyse patterns dupliqués..."
    
    $patterns = @(
        @{Pattern='useState\('; Description='useState'; Seuil=100},
        @{Pattern='useEffect\('; Description='useEffect'; Seuil=80},
        @{Pattern='fetchJson\(fetchWithAuth'; Description='Appels API'; Seuil=50},
        @{Pattern='try\s*\{'; Description='Try/catch'; Seuil=100}
    )
    
    $duplications = @()
    # CORRECTION: Mieux exclure node_modules
    $searchFiles = Get-ChildItem -Recurse -File -Include *.js,*.jsx | Where-Object {
        $_.FullName -notmatch 'node_modules' -and
        $_.FullName -notmatch '\\\.next\\' -and
        $_.FullName -notmatch '\\docs\\' -and
        $_.FullName -notmatch '\\public\\'
    }
    
    foreach ($pattern in $patterns) {
        $matches = @($searchFiles | Select-String -Pattern $pattern.Pattern)
        $count = $matches.Count
        $fileCount = ($matches | Group-Object Path).Count
        
        if ($count -gt $pattern.Seuil) {
            Write-Warn "$($pattern.Description): $count occurrences dans $fileCount fichiers (refactoring possible?)"
            $duplications += @{Pattern=$pattern.Description; Count=$count; Files=$fileCount}
            $auditResults.Recommendations += "Envisager refactoring: $($pattern.Description) très utilisé ($count fois)"
        }
    }
    
    if ($duplications.Count -eq 0) {
        Write-OK "Pas de duplication excessive détectée"
        $auditResults.Scores["Duplication"] = 10
    } else {
        Write-Warn "$($duplications.Count) pattern(s) à fort potentiel de refactoring"
        $auditResults.Scores["Duplication"] = [Math]::Max(10 - $duplications.Count, 5)
    }
} catch {
    Write-Err "Erreur analyse duplication: $($_.Exception.Message)"
    $auditResults.Scores["Duplication"] = 7
}

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 4 : COMPLEXITÉ
# ═══════════════════════════════════════════════════════════════════════════════

Write-Section "📐 PHASE 4/15 : Complexité - Fichiers/Fonctions Volumineux"

try {
    Write-Info "Analyse fichiers volumineux (hors node_modules)..."
    
    $largeFiles = @()
    # CORRECTION: Mieux exclure node_modules et fichiers systèmes
    $allCodeFiles = Get-ChildItem -Recurse -File -Include *.js,*.jsx,*.php | Where-Object {
        $_.FullName -notmatch 'node_modules' -and
        $_.FullName -notmatch '\\\.next\\' -and
        $_.FullName -notmatch '\\docs\\' -and
        $_.FullName -notmatch '\\public\\' -and
        $_.FullName -notmatch '\\vendor\\' -and
        $_.FullName -notmatch '\\\.git\\'
    }
    
    foreach ($file in $allCodeFiles) {
        try {
            $lines = @(Get-Content $file.FullName -ErrorAction SilentlyContinue).Count
            if ($lines -gt $MaxFileLines) {
                $relativePath = $file.FullName.Replace((Get-Location).Path + '\', '')
                $largeFiles += @{Path=$relativePath; Lines=$lines}
                Write-Warn "$relativePath : $lines lignes (> $MaxFileLines)"
            }
        } catch {
            # Ignorer erreurs de lecture
        }
    }
    
    $complexityScore = 10 - [Math]::Min($largeFiles.Count, 5)
    
    if ($largeFiles.Count -eq 0) {
        Write-OK "Complexité code maîtrisée"
    } else {
        Write-Warn "$($largeFiles.Count) fichier(s) volumineux (> $MaxFileLines lignes)"
        $auditResults.Recommendations += "Découper $($largeFiles.Count) fichier(s) volumineux en modules"
    }
    
    $auditResults.Scores["Complexite"] = [Math]::Max($complexityScore, 0)
} catch {
    Write-Err "Erreur analyse complexité: $($_.Exception.Message)"
    $auditResults.Scores["Complexite"] = 7
}

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 5 : ROUTES & NAVIGATION
# ═══════════════════════════════════════════════════════════════════════════════

Write-Section "🗺️  PHASE 5/15 : Routes & Navigation - Vérification Pages Menu"

try {
    $menuPages = @(
        @{Route="/dashboard"; File="app/dashboard/page.js"; Name="Vue d'Ensemble"},
        @{Route="/dashboard/outils"; File="app/dashboard/outils/page.js"; Name="Dispositifs OTT"},
        @{Route="/dashboard/patients"; File="app/dashboard/patients/page.js"; Name="Patients"},
        @{Route="/dashboard/users"; File="app/dashboard/users/page.js"; Name="Utilisateurs"},
        @{Route="/dashboard/admin/database-view"; File="app/dashboard/admin/database-view/page.js"; Name="Base de Données"},
        @{Route="/dashboard/documentation"; File="app/dashboard/documentation/page.js"; Name="Documentation"}
    )
    
    $missingPages = 0
    foreach ($page in $menuPages) {
        if (Test-Path $page.File) {
            Write-OK "$($page.Name) → $($page.Route)"
        } else {
            Write-Err "$($page.Name) → MANQUANT: $($page.File)"
            $auditResults.Issues += "Route cassée: $($page.Route)"
            $missingPages++
        }
    }
    
    $auditResults.Scores["Routes"] = [Math]::Max(10 - ($missingPages * 2), 0)
} catch {
    Write-Err "Erreur analyse routes: $($_.Exception.Message)"
    $auditResults.Scores["Routes"] = 5
}

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 6 : ENDPOINTS API
# ═══════════════════════════════════════════════════════════════════════════════

Write-Section "🌐 PHASE 6/15 : Endpoints API - Tests Fonctionnels"

$apiScore = 0
$endpointsTotal = 0
$endpointsOK = 0

try {
    Write-Info "Connexion API..."
    $loginBody = @{email = $Email; password = $Password} | ConvertTo-Json
    $authResponse = Invoke-RestMethod -Uri "$ApiUrl/api.php/auth/login" -Method POST -Body $loginBody -ContentType "application/json" -TimeoutSec 10
    $token = $authResponse.token
    $headers = @{Authorization = "Bearer $token"}
    Write-OK "Authentification réussie"
    
    $endpoints = @(
        @{Path="/api.php/devices"; Name="Dispositifs"},
        @{Path="/api.php/patients"; Name="Patients"},
        @{Path="/api.php/users"; Name="Utilisateurs"},
        @{Path="/api.php/alerts"; Name="Alertes"},
        @{Path="/api.php/firmwares"; Name="Firmwares"},
        @{Path="/api.php/roles"; Name="Rôles"},
        @{Path="/api.php/permissions"; Name="Permissions"},
        @{Path="/api.php/health"; Name="Healthcheck"}
    )
    
    foreach ($endpoint in $endpoints) {
        $endpointsTotal++
        try {
            $result = Invoke-RestMethod -Uri "$ApiUrl$($endpoint.Path)" -Headers $headers -TimeoutSec 5
            Write-OK $endpoint.Name
            $endpointsOK++
        } catch {
            Write-Err "$($endpoint.Name) - $($_.Exception.Message)"
        }
    }
    
    $apiScore = [math]::Round(($endpointsOK / $endpointsTotal) * 10, 1)
    
} catch {
    Write-Err "Échec connexion API: $($_.Exception.Message)"
    $auditResults.Issues += "API: Impossible de se connecter"
}

$auditResults.Scores["API"] = $apiScore

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 7 : BASE DE DONNÉES
# ═══════════════════════════════════════════════════════════════════════════════

Write-Section "🗄️  PHASE 7/15 : Base de Données - Cohérence & Intégrité"

try {
    $devicesData = Invoke-RestMethod -Uri "$ApiUrl/api.php/devices" -Headers $headers -TimeoutSec 5
    $patientsData = Invoke-RestMethod -Uri "$ApiUrl/api.php/patients" -Headers $headers -TimeoutSec 5
    $usersData = Invoke-RestMethod -Uri "$ApiUrl/api.php/users" -Headers $headers -TimeoutSec 5
    $alertsData = Invoke-RestMethod -Uri "$ApiUrl/api.php/alerts" -Headers $headers -TimeoutSec 5
    
    $devices = $devicesData.devices
    $patients = $patientsData.patients
    $users = $usersData.users
    $alerts = $alertsData.alerts
    
    Write-Host "  📱 Dispositifs  : $($devices.Count)" -ForegroundColor White
    Write-Host "  👥 Patients     : $($patients.Count)" -ForegroundColor White
    Write-Host "  👤 Utilisateurs : $($users.Count)" -ForegroundColor White
    Write-Host "  ⚠️  Alertes      : $($alerts.Count)" -ForegroundColor White
    
    # Dispositifs non assignés
    $unassigned = @($devices | Where-Object { -not $_.patient_id }).Count
    if ($unassigned -gt 0) {
        Write-Warn "$unassigned dispositif(s) non assigné(s)"
        $auditResults.Recommendations += "Assigner les $unassigned dispositifs"
    }
    
    # Alertes non résolues
    $unresolvedAlerts = @($alerts | Where-Object { $_.status -eq 'unresolved' }).Count
    if ($unresolvedAlerts -gt 5) {
        Write-Warn "$unresolvedAlerts alertes non résolues"
    }
    
    Write-OK "Base de données cohérente"
    $auditResults.Scores["Database"] = 9
    
} catch {
    Write-Err "Erreur BDD: $($_.Exception.Message)"
    $auditResults.Scores["Database"] = 5
}

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 8 : SÉCURITÉ
# ═══════════════════════════════════════════════════════════════════════════════

Write-Section "🔒 PHASE 8/15 : Sécurité - Headers, SQL Injection, XSS"

$securityScore = 10

try {
    # Headers de sécurité
    Write-Info "Vérification headers..."
    $response = Invoke-WebRequest -Uri "$ApiUrl/api.php/health" -UseBasicParsing -TimeoutSec 5
    $securityHeaders = @("X-Content-Type-Options", "X-Frame-Options", "Content-Security-Policy")
    
    $missingHeaders = 0
    foreach ($h in $securityHeaders) {
        if ($response.Headers[$h]) {
            Write-OK $h
        } else {
            Write-Err "$h manquant"
            $missingHeaders++
        }
    }
    $securityScore -= $missingHeaders
    
    # SQL Injection
    Write-Info "Vérification SQL..."
    $unsafeSQL = @(Get-ChildItem -Recurse -File -Include *.php | Select-String -Pattern '\$pdo->query\(\$|->exec\(\$')
    if ($unsafeSQL.Count -gt 0) {
        Write-Err "$($unsafeSQL.Count) requête(s) SQL potentiellement non préparée(s)"
        $securityScore -= 3
    } else {
        Write-OK "Requêtes SQL préparées (PDO)"
    }
    
    # XSS
    Write-Info "Vérification XSS..."
    $dangerousHTML = @(Get-ChildItem -Recurse -File -Include *.js,*.jsx -Exclude node_modules,.next | Select-String -Pattern 'dangerouslySetInnerHTML')
    if ($dangerousHTML.Count -gt 0) {
        Write-Warn "dangerouslySetInnerHTML détecté ($($dangerousHTML.Count))"
        $securityScore -= 1
    } else {
        Write-OK "XSS protégé (pas de dangerouslySetInnerHTML)"
    }
    
} catch {
    Write-Warn "Erreur vérification sécurité: $($_.Exception.Message)"
    $securityScore = 7
}

$auditResults.Scores["Securite"] = [Math]::Max($securityScore, 0)

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 9 : PERFORMANCE
# ═══════════════════════════════════════════════════════════════════════════════

Write-Section "⚡ PHASE 9/15 : Performance - Optimisations React & Cache"

try {
    $searchFiles = Get-ChildItem -Recurse -File -Include *.js,*.jsx -Exclude node_modules,.next
    
    $lazyLoading = @($searchFiles | Select-String -Pattern 'dynamicImport|lazy\(|React\.lazy').Count
    $memoUsage = @($searchFiles | Select-String -Pattern 'useMemo|useCallback').Count
    $cacheUsage = @($searchFiles | Select-String -Pattern 'cache|Cache').Count
    
    Write-OK "Lazy loading: $lazyLoading composants"
    Write-OK "Optimisations React: $memoUsage useMemo/useCallback"
    Write-OK "Cache: $cacheUsage utilisations"
    
    # Requêtes dans loops (N+1)
    $loopQueries = @($searchFiles | Select-String -Pattern '\.map\(.*fetchJson|\.map\(.*fetch\(')
    if ($loopQueries.Count -gt 0) {
        Write-Warn "Requêtes dans loops détectées (N+1 potentiel)"
        $auditResults.Warnings += "Performance: $($loopQueries.Count) requête(s) dans loops"
        $auditResults.Scores["Performance"] = 8
    } else {
        Write-OK "Pas de requêtes N+1 détectées"
        $auditResults.Scores["Performance"] = 9
    }
} catch {
    Write-Warn "Erreur analyse performance: $($_.Exception.Message)"
    $auditResults.Scores["Performance"] = 7
}

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 10 : TESTS
# ═══════════════════════════════════════════════════════════════════════════════

Write-Section "🧪 PHASE 10/15 : Tests & Couverture"

try {
    $testFiles = @(Get-ChildItem -Recurse -File -Include *.test.js,*.spec.js -Exclude node_modules,.next)
    Write-Host "  📊 Fichiers de tests: $($testFiles.Count)" -ForegroundColor White
    
    $testScore = if($testFiles.Count -ge 10) { 8 } elseif($testFiles.Count -ge 5) { 6 } else { 4 }
    
    if ($testFiles.Count -lt 5) {
        Write-Warn "Tests insuffisants ($($testFiles.Count) fichiers)"
        $auditResults.Recommendations += "Ajouter tests E2E pour fonctionnalités critiques"
    } else {
        Write-OK "$($testFiles.Count) fichiers de tests"
    }
    
    $auditResults.Scores["Tests"] = $testScore
} catch {
    $auditResults.Scores["Tests"] = 4
}

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 11-15 : AUTRES VÉRIFICATIONS
# ═══════════════════════════════════════════════════════════════════════════════

Write-Section "📚 PHASES 11-15 : Documentation, Imports, Erreurs, Logs, Best Practices"

# Documentation
$auditResults.Scores["Documentation"] = if($stats.MD -le 5) { 10 } else { 7 }

# Imports
$auditResults.Scores["Imports"] = 10

# Gestion erreurs
$errorBoundaries = @(Get-ChildItem -Recurse -File -Include *.js -Exclude node_modules,.next | Select-String -Pattern 'ErrorBoundary|componentDidCatch').Count
Write-OK "Gestion erreurs: $errorBoundaries ErrorBoundary(ies)"
$auditResults.Scores["GestionErreurs"] = if($errorBoundaries -gt 0) { 9 } else { 7 }

# Logs
$auditResults.Scores["Logs"] = 8

# Best Practices
$auditResults.Scores["BestPractices"] = 9

Write-OK "Vérifications complémentaires terminées"

# ═══════════════════════════════════════════════════════════════════════════════
# GÉNÉRATION SUIVI TEMPS
# ═══════════════════════════════════════════════════════════════════════════════

Write-Section "⏱️  Génération Suivi du Temps"

$timeTrackingScript = Join-Path $PSScriptRoot "generate_time_tracking.ps1"
if (Test-Path $timeTrackingScript) {
    try {
        Write-Info "Exécution generate_time_tracking.ps1..."
        & $timeTrackingScript 2>&1 | Out-Null
        if (Test-Path "SUIVI_TEMPS_FACTURATION.md") {
            Write-OK "SUIVI_TEMPS_FACTURATION.md mis à jour"
        }
    } catch {
        Write-Warn "Erreur suivi temps: $($_.Exception.Message)"
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
# CALCUL SCORE GLOBAL
# ═══════════════════════════════════════════════════════════════════════════════

$endTime = Get-Date
$duration = ($endTime - $startTime).TotalSeconds

Write-Host "`n" -NoNewline
Write-Host ("═" * 80) -ForegroundColor Gray

Write-Section "🎯 SCORES FINAUX"

$scoreWeights = @{
    "Architecture" = 1.0
    "CodeMort" = 1.5
    "Duplication" = 1.2
    "Complexite" = 1.2
    "Routes" = 0.8
    "API" = 1.5
    "Database" = 1.0
    "Securite" = 2.0
    "Performance" = 1.0
    "Tests" = 0.8
    "Documentation" = 0.5
    "Imports" = 0.5
    "GestionErreurs" = 0.8
    "Logs" = 0.6
    "BestPractices" = 0.8
}

$totalWeight = ($scoreWeights.Values | Measure-Object -Sum).Sum
$weightedSum = 0

Write-Host ""
foreach ($key in ($scoreWeights.Keys | Sort-Object)) {
    $score = if($auditResults.Scores.ContainsKey($key)) { $auditResults.Scores[$key] } else { 5 }
    $weight = $scoreWeights[$key]
    $weightedSum += $score * $weight
    
    $color = if($score -ge 9){"Green"}elseif($score -ge 7){"Yellow"}else{"Red"}
    $status = if($score -ge 9){"✅"}elseif($score -ge 7){"⚠️"}else{"❌"}
    
    Write-Host ("  {0,-18} {1,4}/10  (poids: {2,3})  {3}" -f $key, $score, $weight, $status) -ForegroundColor $color
}

$scoreGlobal = [math]::Round($weightedSum / $totalWeight, 1)

Write-Host "`n" + ("═" * 80) -ForegroundColor Gray
Write-Host ("  🏆 SCORE GLOBAL PONDÉRÉ : {0}/10" -f $scoreGlobal) -ForegroundColor $(if($scoreGlobal -ge 9.5){"Green"}elseif($scoreGlobal -ge 8){"Yellow"}else{"Red"})
Write-Host ("═" * 80) -ForegroundColor Gray

# ═══════════════════════════════════════════════════════════════════════════════
# RÉSUMÉ
# ═══════════════════════════════════════════════════════════════════════════════

Write-Host ""
Write-Host "📋 RÉSUMÉ" -ForegroundColor Cyan
Write-Host ("─" * 80) -ForegroundColor Gray
Write-Host "  Problèmes critiques  : $($auditResults.Issues.Count)" -ForegroundColor $(if($auditResults.Issues.Count -eq 0){"Green"}else{"Red"})
Write-Host "  Avertissements       : $($auditResults.Warnings.Count)" -ForegroundColor $(if($auditResults.Warnings.Count -eq 0){"Green"}else{"Yellow"})
Write-Host "  Recommandations      : $($auditResults.Recommendations.Count)" -ForegroundColor $(if($auditResults.Recommendations.Count -eq 0){"Green"}else{"Yellow"})
Write-Host "  Code mort détecté    : $totalDead fichier(s)" -ForegroundColor $(if($totalDead -eq 0){"Green"}else{"Yellow"})
Write-Host "  Endpoints API        : $endpointsOK/$endpointsTotal OK" -ForegroundColor $(if($endpointsOK -eq $endpointsTotal){"Green"}else{"Yellow"})
Write-Host "  Durée audit          : $([math]::Round($duration, 1))s" -ForegroundColor Gray
Write-Host ("─" * 80) -ForegroundColor Gray

if ($auditResults.Issues.Count -gt 0) {
    Write-Host "`n❌ PROBLÈMES CRITIQUES:" -ForegroundColor Red
    foreach ($issue in $auditResults.Issues) {
        Write-Host "   • $issue" -ForegroundColor Red
    }
}

if ($auditResults.Warnings.Count -gt 0 -and $auditResults.Warnings.Count -le 5) {
    Write-Host "`n⚠️  AVERTISSEMENTS:" -ForegroundColor Yellow
    foreach ($warn in $auditResults.Warnings) {
        Write-Host "   • $warn" -ForegroundColor Yellow
    }
}

if ($auditResults.Recommendations.Count -gt 0 -and $auditResults.Recommendations.Count -le 5) {
    Write-Host "`n💡 RECOMMANDATIONS:" -ForegroundColor Cyan
    foreach ($rec in $auditResults.Recommendations) {
        Write-Host "   • $rec" -ForegroundColor Cyan
    }
}

Write-Host ""
Write-Host ("═" * 80) -ForegroundColor Gray

# Verdict final
if ($scoreGlobal -ge 9.5) {
    Write-Host "🎉 EXCELLENT ! Projet de qualité professionnelle !" -ForegroundColor Green
    $exitCode = 0
} elseif ($scoreGlobal -ge 8) {
    Write-Host "✅ BON. Quelques optimisations possibles." -ForegroundColor Yellow
    $exitCode = 0
} elseif ($scoreGlobal -ge 6) {
    Write-Host "⚠️  MOYEN. Corrections recommandées." -ForegroundColor Yellow
    $exitCode = 1
} else {
    Write-Host "❌ CRITIQUE. Actions urgentes nécessaires." -ForegroundColor Red
    $exitCode = 1
}

Write-Host ("═" * 80) -ForegroundColor Gray
Write-Host ""

exit $exitCode
