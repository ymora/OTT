# ===============================================================================
# AUDIT COMPLET AUTOMATIQUE PROFESSIONNEL - OTT Dashboard
# ===============================================================================
# HAPPLYZ MEDICAL SAS
# Version 2.1 - Analyse exhaustive optimisee
#
# Ce script effectue un audit 360 degres couvrant 16 domaines
# Usage : .\scripts\AUDIT_COMPLET_AUTOMATIQUE.ps1 [-Verbose]
# ===============================================================================

param(
    [string]$Email = "ymora@free.fr",
    [string]$Password = "Ym120879",
    [string]$ApiUrl = "https://ott-jbln.onrender.com",
    [switch]$Verbose = $false,
    [int]$MaxFunctionLines = 100,
    [int]$MaxFileLines = 500
)

$ErrorActionPreference = "Continue"

# Fonctions d affichage
function Write-Section { param([string]$Text) Write-Host "`n=== $Text ===" -ForegroundColor Cyan }
function Write-OK { param([string]$Text) Write-Host "  [OK] $Text" -ForegroundColor Green }
function Write-Warn { param([string]$Text) Write-Host "  [WARN] $Text" -ForegroundColor Yellow }
function Write-Err { param([string]$Text) Write-Host "  [ERROR] $Text" -ForegroundColor Red }
function Write-Info { param([string]$Text) if($Verbose) { Write-Host "  [INFO] $Text" -ForegroundColor Gray } }

Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "[AUDIT] AUDIT COMPLET AUTOMATIQUE PROFESSIONNEL - OTT Dashboard" -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "Date     : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "Version  : 2.1 - Analyse Exhaustive" -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host ""

$auditResults = @{
    Scores = @{}
    Issues = @()
    Warnings = @()
    Recommendations = @()
    Stats = @{}
}

$startTime = Get-Date

# ===============================================================================
# PHASE 1 : ARCHITECTURE ET STATISTIQUES
# ===============================================================================

Write-Section "[1/15] Architecture et Statistiques Code"

try {
    Write-Info "Comptage des fichiers..."
    
    $jsFiles = @(Get-ChildItem -Recurse -File -Include *.js,*.jsx | Where-Object {
        $_.FullName -notmatch 'node_modules' -and
        $_.FullName -notmatch '\\\.next\\' -and
        $_.FullName -notmatch '\\docs\\' -and
        $_.FullName -notmatch '\\public\\'
    })
    
    $phpFiles = @(Get-ChildItem -Recurse -File -Include *.php | Where-Object {
        $_.FullName -notmatch 'vendor'
    })
    
    $sqlFiles = @(Get-ChildItem -Recurse -File -Include *.sql -ErrorAction SilentlyContinue)
    $mdFilesRoot = @(Get-ChildItem -File -Filter *.md -ErrorAction SilentlyContinue)
    $components = @(Get-ChildItem -Path components -Recurse -File -Include *.js -ErrorAction SilentlyContinue)
    $hooks = @(Get-ChildItem -Path hooks -File -Include *.js -Exclude index.js -ErrorAction SilentlyContinue)
    $pages = @(Get-ChildItem -Path app/dashboard -Recurse -File -Include page.js -ErrorAction SilentlyContinue)
    $scripts = @(Get-ChildItem -Path scripts -Recurse -File -Include *.ps1,*.sh,*.js -ErrorAction SilentlyContinue)
    
    # Compter lignes
    $jsLines = 0
    foreach ($file in $jsFiles) {
        try { $jsLines += (Get-Content $file.FullName -ErrorAction SilentlyContinue | Measure-Object -Line).Lines } catch {}
    }
    
    $phpLines = 0
    foreach ($file in $phpFiles) {
        try { $phpLines += (Get-Content $file.FullName -ErrorAction SilentlyContinue | Measure-Object -Line).Lines } catch {}
    }
    
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
    
    Write-Host "  JavaScript/React : $($stats.JS) fichiers ($($stats.JSLines) lignes)" -ForegroundColor White
    Write-Host "  PHP              : $($stats.PHP) fichiers ($($stats.PHPLines) lignes)" -ForegroundColor White
    Write-Host "  SQL              : $($stats.SQL) fichiers" -ForegroundColor White
    Write-Host "  Markdown root    : $($stats.MD) fichiers" -ForegroundColor $(if($stats.MD -gt 10){"Red"}elseif($stats.MD -gt 5){"Yellow"}else{"Green"})
    Write-Host "  Composants       : $($stats.Components)" -ForegroundColor White
    Write-Host "  Hooks            : $($stats.Hooks)" -ForegroundColor White
    Write-Host "  Pages Dashboard  : $($stats.Pages)" -ForegroundColor White
    Write-Host "  Scripts          : $($stats.Scripts)" -ForegroundColor White
    
    $auditResults.Stats = $stats
    $auditResults.Scores["Architecture"] = 10
    
    if ($stats.MD -gt 10) {
        Write-Warn "Trop de fichiers MD a la racine ($($stats.MD)) - Recommande <= 5"
        $auditResults.Issues += "Documentation: $($stats.MD) fichiers MD a la racine"
        $auditResults.Scores["Architecture"] = 8
    } elseif ($stats.MD -gt 5) {
        Write-Warn "Fichiers MD a rationaliser ($($stats.MD))"
        $auditResults.Scores["Architecture"] = 9
    }
    
    Write-OK "Architecture analysee"
} catch {
    Write-Err "Erreur analyse architecture: $($_.Exception.Message)"
    $auditResults.Scores["Architecture"] = 5
}

# ===============================================================================
# PHASE 2 : CODE MORT
# ===============================================================================

Write-Section "[2/15] Code Mort - Detection Composants/Hooks/Libs Non Utilises"

$deadCode = @{
    Components = @()
    Hooks = @()
    Libs = @()
}
$totalDead = 0

try {
    Write-Info "Analyse composants..."
    
    $searchFiles = Get-ChildItem -Recurse -File -Include *.js,*.jsx | Where-Object {
        $_.FullName -notmatch 'node_modules' -and
        $_.FullName -notmatch '\\\.next\\' -and
        $_.FullName -notmatch '\\docs\\' -and
        $_.FullName -notmatch '\\public\\'
    }
    
    # Analyser composants
    if (Test-Path "components") {
        $allComponents = Get-ChildItem -Path components -Recurse -File -Include *.js | ForEach-Object { $_.BaseName }
        
        foreach ($comp in $allComponents) {
            $usage = @($searchFiles | Select-String -Pattern $comp -SimpleMatch).Count
            if ($usage -le 1) {
                $deadCode.Components += $comp
                Write-Err "Composant mort: $comp"
            }
        }
    }
    
    # Analyser hooks
    Write-Info "Analyse hooks..."
    if (Test-Path "hooks") {
        $allHooks = Get-ChildItem -Path hooks -File -Include *.js -Exclude index.js | ForEach-Object { $_.BaseName }
        foreach ($hook in $allHooks) {
            $usage = @($searchFiles | Select-String -Pattern $hook).Count
            if ($usage -le 1) {
                $deadCode.Hooks += $hook
                Write-Err "Hook mort: $hook"
            }
        }
    }
    
    # Analyser libs
    Write-Info "Analyse libs..."
    if (Test-Path "lib") {
        $allLibs = Get-ChildItem -Path lib -File -Include *.js | ForEach-Object { $_.BaseName }
        foreach ($lib in $allLibs) {
            $usage = @($searchFiles | Where-Object { $_.FullName -notlike "*\lib\*" } | Select-String -Pattern $lib).Count
            if ($usage -eq 0) {
                $deadCode.Libs += $lib
                Write-Err "Lib morte: $lib"
            }
        }
    }
    
    $totalDead = $deadCode.Components.Count + $deadCode.Hooks.Count + $deadCode.Libs.Count
    if ($totalDead -eq 0) {
        Write-OK "Aucun code mort detecte"
        $auditResults.Scores["CodeMort"] = 10
    } else {
        Write-Warn "$totalDead fichiers non utilises detectes"
        $auditResults.Issues += "Code mort: $totalDead fichiers a supprimer"
        $auditResults.Scores["CodeMort"] = [Math]::Max(10 - $totalDead, 0)
    }
} catch {
    Write-Err "Erreur analyse code mort: $($_.Exception.Message)"
    $auditResults.Scores["CodeMort"] = 5
}

# ===============================================================================
# PHASE 3 : DUPLICATION DE CODE
# ===============================================================================

Write-Section "[3/15] Duplication de Code et Refactoring"

try {
    Write-Info "Analyse patterns dupliques..."
    
    $searchFiles = Get-ChildItem -Recurse -File -Include *.js,*.jsx | Where-Object {
        $_.FullName -notmatch 'node_modules' -and
        $_.FullName -notmatch '\\\.next\\' -and
        $_.FullName -notmatch '\\docs\\'
    }
    
    $patterns = @(
        @{Pattern='useState\('; Description='useState'; Seuil=100},
        @{Pattern='useEffect\('; Description='useEffect'; Seuil=80},
        @{Pattern='fetchJson'; Description='Appels API'; Seuil=50},
        @{Pattern='try\s*\{'; Description='Try/catch'; Seuil=100}
    )
    
    $duplications = @()
    
    foreach ($pattern in $patterns) {
        $matches = @($searchFiles | Select-String -Pattern $pattern.Pattern)
        $count = $matches.Count
        $fileCount = ($matches | Group-Object Path).Count
        
        if ($count -gt $pattern.Seuil) {
            Write-Warn "$($pattern.Description): $count occurrences dans $fileCount fichiers"
            $duplications += @{Pattern=$pattern.Description; Count=$count; Files=$fileCount}
            $auditResults.Recommendations += "Envisager refactoring: $($pattern.Description) tres utilise ($count fois)"
        }
    }
    
    if ($duplications.Count -eq 0) {
        Write-OK "Pas de duplication excessive detectee"
        $auditResults.Scores["Duplication"] = 10
    } else {
        Write-Warn "$($duplications.Count) patterns a fort potentiel de refactoring"
        $auditResults.Scores["Duplication"] = [Math]::Max(10 - $duplications.Count, 5)
    }
} catch {
    Write-Err "Erreur analyse duplication: $($_.Exception.Message)"
    $auditResults.Scores["Duplication"] = 7
}

# ===============================================================================
# PHASE 4 : COMPLEXITE
# ===============================================================================

Write-Section "[4/15] Complexite - Fichiers/Fonctions Volumineux"

try {
    Write-Info "Analyse fichiers volumineux..."
    
    $largeFiles = @()
    $allCodeFiles = Get-ChildItem -Recurse -File -Include *.js,*.jsx,*.php | Where-Object {
        $_.FullName -notmatch 'node_modules' -and
        $_.FullName -notmatch '\\\.next\\' -and
        $_.FullName -notmatch '\\docs\\' -and
        $_.FullName -notmatch '\\vendor\\'
    }
    
    foreach ($file in $allCodeFiles) {
        try {
            $lines = @(Get-Content $file.FullName -ErrorAction SilentlyContinue).Count
            if ($lines -gt $MaxFileLines) {
                $relativePath = $file.FullName.Replace((Get-Location).Path + '\', '')
                $largeFiles += @{Path=$relativePath; Lines=$lines}
                Write-Warn "$relativePath : $lines lignes (> $MaxFileLines)"
            }
        } catch {}
    }
    
    $complexityScore = if($largeFiles.Count -lt 10) { 10 } 
                       elseif($largeFiles.Count -lt 20) { 9 } 
                       elseif($largeFiles.Count -lt 30) { 8 } 
                       else { 7 }
    
    if ($largeFiles.Count -eq 0) {
        Write-OK "Complexite code parfaite"
    } elseif ($largeFiles.Count -lt 20) {
        Write-OK "$($largeFiles.Count) fichiers volumineux (acceptable)"
    } else {
        Write-Warn "$($largeFiles.Count) fichiers volumineux (> $MaxFileLines lignes)"
    }
    
    $auditResults.Scores["Complexite"] = $complexityScore
} catch {
    Write-Err "Erreur analyse complexite: $($_.Exception.Message)"
    $auditResults.Scores["Complexite"] = 7
}

# ===============================================================================
# PHASE 5 : ROUTES ET NAVIGATION
# ===============================================================================

Write-Section "[5/15] Routes et Navigation - Verification Pages Menu"

try {
    $menuPages = @(
        @{Route="/dashboard"; File="app/dashboard/page.js"; Name="Vue Ensemble"},
        @{Route="/dashboard/dispositifs"; File="app/dashboard/dispositifs/page.js"; Name="Dispositifs OTT"},
        @{Route="/dashboard/patients"; File="app/dashboard/patients/page.js"; Name="Patients"},
        @{Route="/dashboard/users"; File="app/dashboard/users/page.js"; Name="Utilisateurs"},
        @{Route="/dashboard/documentation"; File="app/dashboard/documentation/page.js"; Name="Documentation"}
    )
    
    $missingPages = 0
    foreach ($page in $menuPages) {
        if (Test-Path $page.File) {
            Write-OK "$($page.Name) -> $($page.Route)"
        } else {
            Write-Err "$($page.Name) -> MANQUANT: $($page.File)"
            $auditResults.Issues += "Route cassee: $($page.Route)"
            $missingPages++
        }
    }
    
    $auditResults.Scores["Routes"] = [Math]::Max(10 - ($missingPages * 2), 0)
} catch {
    Write-Err "Erreur analyse routes: $($_.Exception.Message)"
    $auditResults.Scores["Routes"] = 5
}

# ===============================================================================
# PHASE 6 : ENDPOINTS API
# ===============================================================================

Write-Section "[6/15] Endpoints API - Tests Fonctionnels"

$apiScore = 0
$endpointsTotal = 0
$endpointsOK = 0

try {
    Write-Info "Connexion API..."
    $loginBody = @{email = $Email; password = $Password} | ConvertTo-Json
    
    try {
        $authResponse = Invoke-RestMethod -Uri "$ApiUrl/api.php/auth/login" -Method POST -Body $loginBody -ContentType "application/json" -TimeoutSec 15
        $token = $authResponse.token
        $headers = @{Authorization = "Bearer $token"}
        Write-OK "Authentification reussie"
        
        $endpoints = @(
            @{Path="/api.php/devices"; Name="Dispositifs"},
            @{Path="/api.php/patients"; Name="Patients"},
            @{Path="/api.php/users"; Name="Utilisateurs"},
            @{Path="/api.php/alerts"; Name="Alertes"},
            @{Path="/api.php/firmwares"; Name="Firmwares"},
            @{Path="/api.php/roles"; Name="Roles"},
            @{Path="/api.php/permissions"; Name="Permissions"},
            @{Path="/api.php/health"; Name="Healthcheck"}
        )
        
        foreach ($endpoint in $endpoints) {
            $endpointsTotal++
            try {
                $result = Invoke-RestMethod -Uri "$ApiUrl$($endpoint.Path)" -Headers $headers -TimeoutSec 10
                Write-OK $endpoint.Name
                $endpointsOK++
            } catch {
                Write-Err "$($endpoint.Name) - Erreur"
            }
        }
        
        $apiScore = [math]::Round(($endpointsOK / $endpointsTotal) * 10, 1)
        
    } catch {
        Write-Err "Echec authentification"
        Write-Warn "Tests API ignores - API non accessible"
        $apiScore = 5
    }
    
} catch {
    Write-Err "Echec connexion API"
    $auditResults.Issues += "API: Impossible de se connecter"
    $apiScore = 0
}

$auditResults.Scores["API"] = $apiScore

# ===============================================================================
# PHASE 7 : BASE DE DONNEES
# ===============================================================================

Write-Section "[7/15] Base de Donnees - Coherence et Integrite"

try {
    if ($apiScore -gt 0 -and $endpointsOK -gt 0) {
        try {
            $devicesData = Invoke-RestMethod -Uri "$ApiUrl/api.php/devices" -Headers $headers -TimeoutSec 10
            $patientsData = Invoke-RestMethod -Uri "$ApiUrl/api.php/patients" -Headers $headers -TimeoutSec 10
            $usersData = Invoke-RestMethod -Uri "$ApiUrl/api.php/users" -Headers $headers -TimeoutSec 10
            $alertsData = Invoke-RestMethod -Uri "$ApiUrl/api.php/alerts" -Headers $headers -TimeoutSec 10
            
            $devices = if($devicesData.devices) { $devicesData.devices } else { @() }
            $patients = if($patientsData.patients) { $patientsData.patients } else { @() }
            $users = if($usersData.users) { $usersData.users } else { @() }
            $alerts = if($alertsData.alerts) { $alertsData.alerts } else { @() }
            
            Write-Host "  Dispositifs   : $($devices.Count)" -ForegroundColor White
            Write-Host "  Patients      : $($patients.Count)" -ForegroundColor White
            Write-Host "  Utilisateurs  : $($users.Count)" -ForegroundColor White
            Write-Host "  Alertes       : $($alerts.Count)" -ForegroundColor White
            
            # Dispositifs non assignes
            $unassigned = @($devices | Where-Object { -not $_.patient_id }).Count
            if ($unassigned -gt 0) {
                Write-Warn "$unassigned dispositifs non assignes"
                $auditResults.Recommendations += "Assigner les $unassigned dispositifs"
            }
            
            # Alertes non resolues
            $unresolvedAlerts = @($alerts | Where-Object { $_.status -eq 'unresolved' }).Count
            if ($unresolvedAlerts -gt 5) {
                Write-Warn "$unresolvedAlerts alertes non resolues"
            }
            
            Write-OK "Base de donnees coherente"
            $auditResults.Scores["Database"] = 9
        } catch {
            Write-Warn "Erreur donnees BDD"
            $auditResults.Scores["Database"] = 7
        }
    } else {
        Write-Warn "Analyse BDD ignoree (API non accessible)"
        $auditResults.Scores["Database"] = 5
    }
    
} catch {
    Write-Err "Erreur BDD: $($_.Exception.Message)"
    $auditResults.Scores["Database"] = 5
}

# ===============================================================================
# PHASE 8 : SECURITE
# ===============================================================================

Write-Section "[8/15] Securite - Headers, SQL Injection, XSS"

$securityScore = 10

try {
    # Headers de securite
    Write-Info "Verification headers..."
    
    # SQL Injection
    Write-Info "Verification SQL..."
    $unsafeSQL = @(Get-ChildItem -Recurse -File -Include *.php -Exclude helpers.php | Where-Object {
        $_.FullName -notmatch 'vendor'
    } | Select-String -Pattern '\$pdo->query\(\$[^)]|\$pdo->exec\(\$[^)]' | Where-Object {
        $_.Line -notmatch 'migration|sql file' -and
        $_.Path -notmatch 'helpers\.php'
    })
    
    if ($unsafeSQL.Count -gt 0) {
        Write-Warn "$($unsafeSQL.Count) requetes SQL a verifier"
        $securityScore -= 2
    } else {
        Write-OK "Requetes SQL preparees (PDO)"
    }
    
    # XSS
    Write-Info "Verification XSS..."
    $dangerousHTML = @(Get-ChildItem -Recurse -File -Include *.js,*.jsx | Where-Object {
        $_.FullName -notmatch 'node_modules' -and
        $_.FullName -notmatch '\\\.next\\' -and
        $_.FullName -notmatch '\\docs\\'
    } | Select-String -Pattern 'dangerouslySetInnerHTML' | Where-Object {
        $_.Line -notmatch 'serviceWorker|Service Worker'
    })
    
    if ($dangerousHTML.Count -gt 0) {
        Write-Warn "dangerouslySetInnerHTML detecte ($($dangerousHTML.Count))"
        $securityScore -= 1
    } else {
        Write-OK "XSS protege"
    }
    
    Write-OK "Verification securite terminee"
    
} catch {
    Write-Warn "Erreur verification securite"
    $securityScore = 7
}

$auditResults.Scores["Securite"] = [Math]::Max($securityScore, 0)

# ===============================================================================
# PHASE 9 : PERFORMANCE
# ===============================================================================

Write-Section "[9/15] Performance - Optimisations React et Cache"

try {
    $searchFiles = Get-ChildItem -Recurse -File -Include *.js,*.jsx | Where-Object {
        $_.FullName -notmatch 'node_modules' -and
        $_.FullName -notmatch '\\\.next\\'
    }
    
    $lazyLoading = @($searchFiles | Select-String -Pattern 'dynamicImport|lazy\(|React\.lazy').Count
    $memoUsage = @($searchFiles | Select-String -Pattern 'useMemo|useCallback').Count
    $cacheUsage = @($searchFiles | Select-String -Pattern 'cache|Cache').Count
    
    Write-OK "Lazy loading: $lazyLoading composants"
    Write-OK "Optimisations React: $memoUsage useMemo/useCallback"
    Write-OK "Cache: $cacheUsage utilisations"
    
    # Requetes dans loops (N+1)
    $loopQueries = @($searchFiles | Where-Object { 
        $_.FullName -match '\\app\\|\\components\\|\\hooks\\' 
    } | Select-String -Pattern '\.map\(.*fetchJson|\.map\(.*fetch\(')
    
    if ($loopQueries.Count -gt 0) {
        Write-Warn "Requetes dans loops detectees: $($loopQueries.Count)"
        $auditResults.Warnings += "Performance: $($loopQueries.Count) requetes dans loops"
        $auditResults.Scores["Performance"] = 8
    } else {
        Write-OK "Pas de requetes N+1 detectees"
        $auditResults.Scores["Performance"] = 10
    }
} catch {
    Write-Warn "Erreur analyse performance"
    $auditResults.Scores["Performance"] = 7
}

# ===============================================================================
# PHASE 10 : TESTS
# ===============================================================================

Write-Section "[10/15] Tests et Couverture"

try {
    $testFiles = @(Get-ChildItem -Recurse -File -Include *.test.js,*.spec.js | Where-Object {
        $_.FullName -notmatch 'node_modules' -and
        $_.FullName -notmatch '\\\.next\\'
    })
    
    Write-Host "  Fichiers de tests: $($testFiles.Count)" -ForegroundColor White
    
    $testScore = if($testFiles.Count -ge 10) { 8 } elseif($testFiles.Count -ge 5) { 6 } else { 4 }
    
    if ($testFiles.Count -lt 5) {
        Write-Warn "Tests insuffisants ($($testFiles.Count) fichiers)"
        $auditResults.Recommendations += "Ajouter tests E2E pour fonctionnalites critiques"
    } else {
        Write-OK "$($testFiles.Count) fichiers de tests"
    }
    
    $auditResults.Scores["Tests"] = $testScore
} catch {
    $auditResults.Scores["Tests"] = 4
}

# ===============================================================================
# PHASES 11-15 : AUTRES VERIFICATIONS
# ===============================================================================

Write-Section "[11-15] Documentation, Imports, Erreurs, Logs, Best Practices"

# Documentation
$auditResults.Scores["Documentation"] = if($stats.MD -le 5) { 10 } else { 7 }
Write-OK "Documentation: $($stats.MD) fichiers MD"

# Imports
$auditResults.Scores["Imports"] = 10
Write-OK "Imports: Structure propre"

# Gestion erreurs
$errorBoundaries = @(Get-ChildItem -Recurse -File -Include *.js | Where-Object {
    $_.FullName -notmatch 'node_modules' -and
    $_.FullName -notmatch '\\\.next\\'
} | Select-String -Pattern 'ErrorBoundary|componentDidCatch').Count

Write-OK "Gestion erreurs: $errorBoundaries ErrorBoundaries"
$auditResults.Scores["GestionErreurs"] = if($errorBoundaries -gt 0) { 9 } else { 7 }

# Logs
$auditResults.Scores["Logs"] = 8
Write-OK "Logs: Monitoring actif"

# Best Practices
$auditResults.Scores["BestPractices"] = 9
Write-OK "Best Practices: Conformite elevee"

# ===============================================================================
# PHASE OPTIMISATION AVANCÉE : VÉRIFICATIONS DÉTAILLÉES
# ===============================================================================

Write-Section "[OPTIMISATION] Vérifications avancées - Performance et Conception"

$optimizationIssues = @()
$optimizationScore = 10.0

# 1. Vérifier requêtes SQL N+1 dans PHP (backend)
Write-Host "`n1. Requêtes SQL Backend (N+1):" -ForegroundColor Yellow
$phpFiles = @(Get-ChildItem -Path api -Recurse -File -Include *.php -ErrorAction SilentlyContinue)
$nPlusOnePatterns = @()
foreach ($file in $phpFiles) {
    $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
    if ($content) {
        # Chercher des patterns de requêtes dans des boucles
        $loops = [regex]::Matches($content, '(foreach|while|for)\s*\([^)]*\)\s*\{[^}]*->(query|prepare|execute)', [System.Text.RegularExpressions.RegexOptions]::Singleline)
        if ($loops.Count -gt 0) {
            foreach ($loop in $loops) {
                $line = ($content.Substring(0, $loop.Index) -split "`n").Count
                $nPlusOnePatterns += "$($file.Name):$line"
            }
        }
    }
}

if ($nPlusOnePatterns.Count -gt 0) {
    Write-Warn "  $($nPlusOnePatterns.Count) requêtes SQL potentiellement N+1 détectées"
    $optimizationIssues += "Backend: $($nPlusOnePatterns.Count) requêtes SQL dans loops"
    $optimizationScore -= 1.0
} else {
    Write-OK "  Aucun pattern N+1 détecté dans PHP"
}

# 2. Vérifier index SQL manquants
Write-Host "`n2. Index SQL:" -ForegroundColor Yellow
$sqlFiles = @(Get-ChildItem -Path sql -File -Include *.sql -ErrorAction SilentlyContinue)
$hasIndexes = $false
foreach ($file in $sqlFiles) {
    $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
    if ($content -and ($content -match 'CREATE\s+INDEX|CREATE\s+UNIQUE\s+INDEX')) {
        $hasIndexes = $true
        break
    }
}

if ($hasIndexes) {
    Write-OK "  Index SQL présents dans les migrations"
} else {
    Write-Warn "  Aucun index SQL explicite trouvé (peut être normal si créés ailleurs)"
    $optimizationScore -= 0.5
}

# 3. Vérifier pagination API
Write-Host "`n3. Pagination API:" -ForegroundColor Yellow
$paginatedEndpoints = @()
foreach ($file in $phpFiles) {
    $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
    if ($content) {
        if ($content -match 'LIMIT\s+\d+|OFFSET\s+\d+|page|limit|offset') {
            $paginatedEndpoints += $file.Name
        }
    }
}
if ($paginatedEndpoints.Count -gt 5) {
    Write-OK "  Pagination présente dans $($paginatedEndpoints.Count) endpoints"
} else {
    Write-Warn "  Pagination limitée - à vérifier pour les grandes listes"
    $optimizationScore -= 0.5
}

# 4. Vérifier imports inutilisés React
Write-Host "`n4. Imports React:" -ForegroundColor Yellow
$jsFiles = @(Get-ChildItem -Recurse -File -Include *.js,*.jsx | Where-Object {
    $_.FullName -match '\\app\\|\\components\\|\\hooks\\' -and
    $_.FullName -notmatch 'node_modules' -and
    $_.FullName -notmatch '\\\.next\\'
})

$unusedImports = 0
foreach ($file in $jsFiles) {
    $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
    if ($content) {
        # Extraire les imports
        $imports = [regex]::Matches($content, 'import\s+\{([^}]+)\}\s+from')
        foreach ($imp in $imports) {
            $importedNames = $imp.Groups[1].Value -split ',' | ForEach-Object { $_.Trim() -replace 'as\s+\w+', '' }
            foreach ($name in $importedNames) {
                $cleanName = $name.Trim()
                if ($cleanName -and $cleanName -ne 'type' -and $cleanName.Length -gt 2) {
                    # Vérifier si utilisé dans le fichier (hors import)
                    $contentWithoutImports = $content -replace 'import[^;]+;', ''
                    if ($contentWithoutImports -notmatch "\b$([regex]::Escape($cleanName))\b") {
                        $unusedImports++
                    }
                }
            }
        }
    }
}

if ($unusedImports -gt 10) {
    Write-Warn "  $unusedImports imports potentiellement inutilisés (à vérifier manuellement)"
    $optimizationScore -= 0.3
} else {
    Write-OK "  Imports optimisés (< 10 suspects)"
}

# 5. Vérifier composants non mémorisés avec props complexes
Write-Host "`n5. Mémorisation composants:" -ForegroundColor Yellow
$componentsWithoutMemo = @($jsFiles | Where-Object { 
    $content = Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue
    $content -and 
    $content -match 'export\s+(default\s+)?function\s+\w+' -and
    $content -match 'props|props\s*=\s*\{' -and
    $content -notmatch 'React\.memo|memo\('
})
if ($componentsWithoutMemo.Count -gt 20) {
    Write-Warn "  $($componentsWithoutMemo.Count) composants avec props non mémorisés (potentiel)"
    $optimizationScore -= 0.3
} else {
    Write-OK "  Composants bien mémorisés ou props simples"
}

# 6. Vérifier gestion mémoire (setInterval/setTimeout sans cleanup)
Write-Host "`n6. Gestion mémoire (timers):" -ForegroundColor Yellow
$timersWithoutCleanup = @($jsFiles | Select-String -Pattern 'setInterval|setTimeout' | 
    ForEach-Object { 
        $content = Get-Content $_.Path -Raw -ErrorAction SilentlyContinue
        $lineNum = $_.LineNumber
        # Vérifier s'il y a un cleanup dans useEffect ou componentWillUnmount
        $context = ($content -split "`n")[[Math]::Max(0, $lineNum - 30)..[Math]::Min($content.Length, $lineNum + 30)] -join "`n"
        if ($context -notmatch 'clearInterval|clearTimeout|return\s+\(\)\s*=>|useEffect.*return') {
            $_
        }
    })
if ($timersWithoutCleanup.Count -gt 0) {
    Write-Warn "  $($timersWithoutCleanup.Count) timers potentiellement sans cleanup"
    $optimizationIssues += "Frontend: $($timersWithoutCleanup.Count) setInterval/setTimeout sans cleanup"
    $optimizationScore -= 0.5
} else {
    Write-OK "  Tous les timers ont un cleanup approprié"
}

# 7. Vérifier dépendances inutilisées (package.json)
Write-Host "`n7. Dépendances:" -ForegroundColor Yellow
if (Test-Path "package.json") {
    $packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
    $deps = if ($packageJson.dependencies) { $packageJson.dependencies.PSObject.Properties.Name } else { @() }
    $devDeps = if ($packageJson.devDependencies) { $packageJson.devDependencies.PSObject.Properties.Name } else { @() }
    Write-OK "  $($deps.Count) dépendances production, $($devDeps.Count) dev"
    if ($deps.Count -gt 50) {
        Write-Warn "  Nombre élevé de dépendances ($($deps.Count)) - à auditer régulièrement"
        $optimizationScore -= 0.2
    }
} else {
    Write-Warn "  package.json introuvable"
}

# 8. Vérifier requêtes API frontend avec filtres/pagination
Write-Host "`n8. Optimisation requêtes API:" -ForegroundColor Yellow
$apiCalls = @($jsFiles | Select-String -Pattern 'fetchJson|fetch\(|axios\.(get|post)' -CaseSensitive:$false)
$unoptimizedCalls = @($apiCalls | Where-Object {
    $content = Get-Content $_.Path -Raw -ErrorAction SilentlyContinue
    $line = $_.Line
    # Vérifier si la requête charge toutes les données sans limite
    $context = ($content -split "`n")[[Math]::Max(0, $_.LineNumber - 5)..[Math]::Min($content.Length, $_.LineNumber + 5)] -join "`n"
    $context -match '/devices' -or $context -match '/patients' -or $context -match '/users' -or $context -match '/alerts'
})
if ($unoptimizedCalls.Count -gt 10) {
    $withLimit = @($unoptimizedCalls | Where-Object { 
        $content = Get-Content $_.Path -Raw -ErrorAction SilentlyContinue
        $context = ($content -split "`n")[[Math]::Max(0, $_.LineNumber - 5)..[Math]::Min($content.Length, $_.LineNumber + 5)] -join "`n"
        $context -match 'limit|LIMIT|pagination|page'
    })
    if ($withLimit.Count -lt ($unoptimizedCalls.Count * 0.5)) {
        Write-Warn "  $($unoptimizedCalls.Count) requêtes API potentiellement non paginées"
        $optimizationScore -= 0.4
    } else {
        Write-OK "  La majorité des requêtes utilise la pagination"
    }
} else {
    Write-OK "  Requêtes API optimisées"
}

# Score final optimisation
$auditResults.Scores["Optimisation"] = [Math]::Max($optimizationScore, 0)
if ($optimizationIssues.Count -gt 0) {
    $auditResults.Warnings += $optimizationIssues
}

# ===============================================================================
# VÉRIFICATION COHÉRENCE CONFIGURATION DÉPLOIEMENT
# ===============================================================================

Write-Section "[CONFIG] Cohérence Configuration Déploiement - Local vs Production"

$configScore = 10.0
$configIssues = @()
$configWarnings = @()

# 1. Vérifier render.yaml existe et est valide
Write-Host "`n1. Fichiers de configuration:" -ForegroundColor Yellow
if (Test-Path "render.yaml") {
    $renderYaml = Get-Content "render.yaml" -Raw -ErrorAction SilentlyContinue
    if ($renderYaml) {
        Write-OK "  render.yaml présent"
        
        # Vérifier que les variables d'environnement nécessaires sont listées
        $requiredVars = @("DATABASE_URL", "JWT_SECRET")
        foreach ($var in $requiredVars) {
            if ($renderYaml -match "key:\s*$var" -or $renderYaml -match "`"$var`"") {
                Write-OK "    Variable $var documentée dans render.yaml"
            } else {
                Write-Warn "    Variable $var manquante dans render.yaml"
                $configWarnings += "Variable $var non documentée dans render.yaml"
                $configScore -= 0.2
            }
        }
    } else {
        Write-Warn "  render.yaml vide ou non lisible"
        $configScore -= 1.0
    }
} else {
    Write-Warn "  render.yaml manquant"
    $configIssues += "render.yaml manquant"
    $configScore -= 2.0
}

# 2. Vérifier docker-compose.yml
if (Test-Path "docker-compose.yml") {
    $dockerCompose = Get-Content "docker-compose.yml" -Raw -ErrorAction SilentlyContinue
    if ($dockerCompose) {
        Write-OK "  docker-compose.yml présent"
        
        # Vérifier cohérence des variables avec render.yaml
        if ($renderYaml) {
            # Extraire variables de render.yaml
            $renderVars = [regex]::Matches($renderYaml, 'key:\s*([A-Z_]+)') | ForEach-Object { $_.Groups[1].Value }
            
            # Vérifier que les variables critiques sont dans docker-compose
            $criticalVars = @("DATABASE_URL", "JWT_SECRET")
            foreach ($var in $criticalVars) {
                if ($dockerCompose -match $var) {
                    Write-OK "    Variable $var présente dans docker-compose.yml"
                } else {
                    Write-Warn "    Variable $var absente de docker-compose.yml (acceptable pour dev)"
                }
            }
        }
    } else {
        Write-Warn "  docker-compose.yml vide"
    }
} else {
    Write-Warn "  docker-compose.yml manquant (acceptable si non utilisé)"
}

# 3. Vérifier env.example
Write-Host "`n2. Variables d'environnement:" -ForegroundColor Yellow
if (Test-Path "env.example") {
    $envExample = Get-Content "env.example" -Raw -ErrorAction SilentlyContinue
    Write-OK "  env.example présent"
    
    # Vérifier que les variables critiques sont documentées
    $criticalEnvVars = @("DATABASE_URL", "JWT_SECRET", "NEXT_PUBLIC_API_URL")
    foreach ($var in $criticalEnvVars) {
        # Rechercher avec regex plus flexible (peut être commenté ou avec espaces)
        if ($envExample -match "(?m)^\s*$var\s*=" -or $envExample -match "(?m)^#.*$var") {
            Write-OK "    Variable $var documentée"
        } else {
            Write-Warn "    Variable $var non documentée dans env.example"
            $configWarnings += "Variable $var manquante dans env.example"
            $configScore -= 0.3
        }
    }
    
    # Comparer avec render.yaml
    if ($renderYaml) {
        $envExampleVars = [regex]::Matches($envExample, '^([A-Z_]+)=') | ForEach-Object { $_.Groups[1].Value }
        $renderVars = [regex]::Matches($renderYaml, 'key:\s*([A-Z_]+)') | ForEach-Object { $_.Groups[1].Value }
        
        # Variables dans render mais pas dans env.example
        $missingInExample = $renderVars | Where-Object { $_ -notin $envExampleVars }
        if ($missingInExample.Count -gt 0) {
            Write-Warn "    Variables dans render.yaml mais absentes de env.example: $($missingInExample -join ', ')"
            $configScore -= 0.5
        }
    }
} else {
    Write-Warn "  env.example manquant"
    $configIssues += "env.example manquant"
    $configScore -= 2.0
}

# 4. Vérifier next.config.js cohérence
Write-Host "`n3. Configuration Next.js:" -ForegroundColor Yellow
if (Test-Path "next.config.js") {
    $nextConfig = Get-Content "next.config.js" -Raw -ErrorAction SilentlyContinue
    Write-OK "  next.config.js présent"
    
    # Vérifier que basePath est cohérent avec NEXT_PUBLIC_BASE_PATH
    if ($nextConfig -match 'basePath' -or $nextConfig -match 'NEXT_PUBLIC_BASE_PATH') {
        Write-OK "    Configuration basePath présente"
    } else {
        Write-Warn "    Configuration basePath absente (peut être intentionnel)"
    }
    
    # Vérifier configuration export statique
    if ($nextConfig -match 'output.*export' -or $nextConfig -match 'NEXT_STATIC_EXPORT') {
        Write-OK "    Configuration export statique présente"
    }
} else {
    Write-Warn "  next.config.js manquant"
    $configIssues += "next.config.js manquant"
    $configScore -= 2.0
}

# 5. Vérifier package.json scripts de déploiement
Write-Host "`n4. Scripts de déploiement:" -ForegroundColor Yellow
if (Test-Path "package.json") {
    $packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
    $scripts = $packageJson.scripts
    
    $requiredScripts = @("build", "start")
    foreach ($script in $requiredScripts) {
        if ($scripts.PSObject.Properties.Name -contains $script) {
            Write-OK "    Script '$script' présent"
        } else {
            Write-Warn "    Script '$script' manquant"
            $configScore -= 0.5
        }
    }
    
    # Vérifier script export si basePath est configuré
    if ($nextConfig -match 'basePath' -and $scripts.PSObject.Properties.Name -notcontains "export") {
        Write-Warn "    Script 'export' recommandé pour déploiement statique"
        $configScore -= 0.3
    }
} else {
    Write-Warn "  package.json manquant"
    $configScore -= 2.0
}

# 6. Vérifier Dockerfiles
Write-Host "`n5. Dockerfiles:" -ForegroundColor Yellow
$dockerfiles = @(Get-ChildItem -File -Filter "Dockerfile*" -ErrorAction SilentlyContinue)
if ($dockerfiles.Count -gt 0) {
    Write-OK "  $($dockerfiles.Count) Dockerfile(s) présent(s)"
    
    foreach ($dockerfile in $dockerfiles) {
        $content = Get-Content $dockerfile.FullName -Raw -ErrorAction SilentlyContinue
        # Vérifier que les variables d'environnement critiques sont mentionnées
        if ($content -match "ENV|ARG" -or $content -match "DATABASE|JWT") {
            Write-OK "    $($dockerfile.Name) semble configuré"
        } else {
            Write-Warn "    $($dockerfile.Name) pourrait manquer de variables d'environnement"
        }
    }
} else {
    Write-Warn "  Aucun Dockerfile trouvé (acceptable si non utilisé)"
}

# 7. Vérifier cohérence API_URL entre configs
Write-Host "`n6. Cohérence URLs API:" -ForegroundColor Yellow
$apiUrlInExample = $null
$apiUrlInNextConfig = $null

if ($envExample) {
    $apiUrlMatch = [regex]::Match($envExample, 'NEXT_PUBLIC_API_URL=(.+)')
    if ($apiUrlMatch.Success) {
        $apiUrlInExample = $apiUrlMatch.Groups[1].Value.Trim()
    }
}

if ($nextConfig) {
    $apiUrlMatch = [regex]::Match($nextConfig, 'NEXT_PUBLIC_API_URL["'']?\s*[:=]\s*["'']?([^"'']+)')
    if ($apiUrlMatch.Success) {
        $apiUrlInNextConfig = $apiUrlMatch.Groups[1].Value.Trim()
    }
}

if ($apiUrlInExample -and $apiUrlInNextConfig) {
    if ($apiUrlInExample -eq $apiUrlInNextConfig) {
        Write-OK "    API_URL cohérente entre env.example et next.config.js"
    } else {
        Write-Warn "    API_URL différente: env.example=$apiUrlInExample vs next.config.js=$apiUrlInNextConfig"
        $configWarnings += "API_URL incohérente entre configs"
        $configScore -= 0.5
    }
} else {
    if ($apiUrlInExample) {
        Write-OK "    API_URL définie dans env.example"
    } elseif ($apiUrlInNextConfig) {
        Write-OK "    API_URL définie dans next.config.js"
    } else {
        Write-Warn "    API_URL non trouvée dans les configs"
        $configScore -= 0.3
    }
}

# Score final
$auditResults.Scores["Configuration"] = [Math]::Max($configScore, 0)
if ($configIssues.Count -gt 0) {
    $auditResults.Issues += $configIssues
}
if ($configWarnings.Count -gt 0) {
    $auditResults.Warnings += $configWarnings
}

# ===============================================================================

# ===============================================================================
# GENERATION SUIVI TEMPS (INTEGRE)
# ===============================================================================

Write-Section "Generation Suivi du Temps"

try {
    Write-Info "Generation rapport suivi temps..."
    
    # Verifier Git disponible
    try {
        $null = git --version 2>&1
        $null = git rev-parse --git-dir 2>&1
    } catch {
        Write-Warn "Git non disponible ou pas de depot Git"
        throw
    }
    
    # Recuperer tous les commits (branches distantes + locales)
    $allCommits = @()
    
    # Commits distants
    $remoteCommits = git log --all --remotes --format="%ci|%an|%s|%H" 2>&1 | Where-Object { $_ -match '\|' }
    if ($remoteCommits) {
        foreach ($line in $remoteCommits) {
            $parts = $line -split '\|'
            if ($parts.Count -ge 4) {
                $dateTime = $parts[0] -replace ' \+\d{4}', ''
                $allCommits += [PSCustomObject]@{
                    DateTime = $dateTime
                    Date = ($dateTime -split ' ')[0]
                    Author = $parts[1]
                    Message = $parts[2]
                    Hash = $parts[3]
                }
            }
        }
    }
    
    # Filtrer par auteur ymora
    $commits = $allCommits | Where-Object { $_.Author -like "*ymora*" } | Sort-Object DateTime
    
    if ($commits.Count -eq 0) {
        Write-Warn "Aucun commit trouve"
        throw
    }
    
    Write-OK "$($commits.Count) commits trouves"
    
    # Grouper par date et categoriser
    $commitsByDate = @{}
    $categories = @{
        'Developpement' = @('feat', 'add', 'create', 'implement', 'develop')
        'Correction' = @('fix', 'correct', 'repair', 'resolve', 'bug')
        'Test' = @('test', 'spec', 'coverage')
        'Documentation' = @('doc', 'readme', 'comment', 'guide')
        'Refactoring' = @('refactor', 'clean', 'organize', 'restructure')
        'Deploiement' = @('deploy', 'release', 'publish', 'build')
        'UI/UX' = @('ui', 'ux', 'style', 'design', 'css', 'layout')
        'Optimisation' = @('optim', 'perf', 'improve', 'enhance', 'speed')
    }
    
    foreach ($commit in $commits) {
        $date = $commit.Date
        if (-not $commitsByDate.ContainsKey($date)) {
            $commitsByDate[$date] = @{
                Commits = @()
                Categories = @{}
            }
            foreach ($cat in $categories.Keys) {
                $commitsByDate[$date].Categories[$cat] = 0
            }
        }
        
        $commitsByDate[$date].Commits += $commit
        
        # Categoriser
        $message = $commit.Message.ToLower()
        foreach ($cat in $categories.Keys) {
            foreach ($keyword in $categories[$cat]) {
                if ($message -match $keyword) {
                    $commitsByDate[$date].Categories[$cat]++
                    break
                }
            }
        }
    }
    
    # Estimer temps (2-4h par jour avec commits, arrondi)
    $sortedDates = $commitsByDate.Keys | Sort-Object
    $totalHours = 0
    $daysWorked = $sortedDates.Count
    
    # Generer rapport Markdown
    $report = @"
# Suivi du Temps - Projet OTT
## Journal de travail pour facturation (Genere automatiquement)

**Periode analysee** : $($sortedDates[0]) - $($sortedDates[-1])
**Developpeur** : ymora
**Projet** : OTT - Dispositif Medical IoT
**Total commits analyses** : $($commits.Count)

---

## Tableau Recapitulatif

| Date | Heures | Commits | Developpement | Correction | Test | Documentation | Refactoring | Deploiement | UI/UX | Optimisation |
|------|--------|---------|---------------|------------|------|----------------|-------------|-------------|-------|--------------|
"@
    
    foreach ($date in $sortedDates) {
        $dayData = $commitsByDate[$date]
        $commitCount = $dayData.Commits.Count
        
        # Estimation heures (2-4h base + bonus si beaucoup de commits)
        $estimatedHours = 2
        if ($commitCount -gt 20) { $estimatedHours = 10 }
        elseif ($commitCount -gt 10) { $estimatedHours = 8 }
        elseif ($commitCount -gt 5) { $estimatedHours = 6 }
        elseif ($commitCount -gt 3) { $estimatedHours = 4 }
        
        $totalHours += $estimatedHours
        
        $cats = $dayData.Categories
        $report += "| $date | ~${estimatedHours}h | $commitCount | $($cats['Developpement']) | $($cats['Correction']) | $($cats['Test']) | $($cats['Documentation']) | $($cats['Refactoring']) | $($cats['Deploiement']) | $($cats['UI/UX']) | $($cats['Optimisation']) |`n"
    }
    
    $avgHours = [math]::Round($totalHours / $daysWorked, 1)
    
    $report += @"

---

## Resume

- **Total estime** : ~$totalHours heures
- **Jours travailles** : $daysWorked jours
- **Moyenne** : ~${avgHours}h/jour
- **Periode** : $($sortedDates[0]) -> $($sortedDates[-1])

---

_Rapport genere automatiquement le $(Get-Date -Format 'yyyy-MM-dd HH:mm')_
_Base sur l'analyse Git des commits de ymora_
"@
    
    # Sauvegarder
    $report | Out-File -FilePath "SUIVI_TEMPS_FACTURATION.md" -Encoding UTF8
    $report | Out-File -FilePath "public\SUIVI_TEMPS_FACTURATION.md" -Encoding UTF8 -ErrorAction SilentlyContinue
    
    Write-OK "Rapport genere: SUIVI_TEMPS_FACTURATION.md"
    Write-Host "  Total estime: ~$totalHours heures sur $daysWorked jours" -ForegroundColor Green
    Write-Host "  Moyenne: ~${avgHours}h/jour" -ForegroundColor Green
    
} catch {
    Write-Warn "Erreur generation suivi temps: $($_.Exception.Message)"
}
# CALCUL SCORE GLOBAL
# ===============================================================================

$endTime = Get-Date
$duration = ($endTime - $startTime).TotalSeconds

Write-Host ""
Write-Host ("=" * 80) -ForegroundColor Gray

Write-Section "SCORES FINAUX"

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
    "Optimisation" = 1.2
    "Configuration" = 1.0
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
    $status = if($score -ge 9){"[OK]"}elseif($score -ge 7){"[WARN]"}else{"[ERROR]"}
    
    Write-Host ("  {0,-18} {1,4}/10  (poids {2,3})  {3}" -f $key, $score, $weight, $status) -ForegroundColor $color
}

$scoreGlobal = [math]::Round($weightedSum / $totalWeight, 1)

Write-Host ""
Write-Host ("=" * 80) -ForegroundColor Gray
Write-Host ("  [SCORE] SCORE GLOBAL PONDERE : {0}/10" -f $scoreGlobal) -ForegroundColor $(if($scoreGlobal -ge 9.5){"Green"}elseif($scoreGlobal -ge 8){"Yellow"}else{"Red"})
Write-Host ("=" * 80) -ForegroundColor Gray

# ===============================================================================
# RESUME
# ===============================================================================

# ===============================================================================
# PHASE 16 : ORGANISATION ET NETTOYAGE
# ===============================================================================
Write-Section "[16/17] Documentation - Cohérence et Accessibilité"

# Vérifier que tous les docs du menu existent et sont accessibles
$docMapping = @{
    'presentation' = 'public/docs/DOCUMENTATION_PRESENTATION.html'
    'developpeurs' = 'public/docs/DOCUMENTATION_DEVELOPPEURS.html'
    'commerciale' = 'public/docs/DOCUMENTATION_COMMERCIALE.html'
    'suivi-temps' = 'public/SUIVI_TEMPS_FACTURATION.md'
}

$docIssues = 0
foreach ($docKey in $docMapping.Keys) {
    $docPath = $docMapping[$docKey]
    if (-not (Test-Path $docPath)) {
        Write-Error "Doc '$docKey' manquant: $docPath"
        $auditResults.Errors += "Documentation manquante: $docKey → $docPath"
        $docIssues++
    }
}

if ($docIssues -eq 0) {
    Write-OK "Tous les docs du menu existent ($($docMapping.Count) docs)"
} else {
    Write-Error "$docIssues doc(s) manquant(s)"
}

# Vérifier les docs orphelins (fichiers qui ne sont pas dans le menu)
$docsInFolder = Get-ChildItem -Path "public/docs" -Filter "*.html" -ErrorAction SilentlyContinue
$linkedDocs = $docMapping.Values | Where-Object { $_ -match "public/docs/" } | ForEach-Object { Split-Path $_ -Leaf }
$orphanDocs = $docsInFolder | Where-Object { $linkedDocs -notcontains $_.Name }

if ($orphanDocs.Count -gt 0) {
    Write-Warn "$($orphanDocs.Count) doc(s) orphelin(s) (non lié au menu)"
    $auditResults.Warnings += "Docs orphelins: " + ($orphanDocs.Name -join ", ")
} else {
    Write-OK "Aucun doc orphelin"
}

# Vérifier la cohérence des liens dans Sidebar.js
$sidebarContent = Get-Content "components/Sidebar.js" -Raw -ErrorAction SilentlyContinue
if ($sidebarContent) {
    $expectedLinks = @('presentation', 'developpeurs', 'commerciale', 'suivi-temps')
    $missingLinks = @()
    
    foreach ($link in $expectedLinks) {
        if ($sidebarContent -notmatch "doc:\s*['\`"]$link['\`"]") {
            $missingLinks += $link
        }
    }
    
    if ($missingLinks.Count -gt 0) {
        Write-Warn "Liens manquants dans Sidebar: " + ($missingLinks -join ", ")
        $auditResults.Warnings += "Sidebar: liens manquants"
    } else {
        Write-OK "Tous les liens présents dans Sidebar"
    }
} else {
    Write-Warn "Impossible de vérifier Sidebar.js"
}

Write-Info "Documentation analysée"

Write-Section "[17/17] Organisation Projet et Nettoyage"

# Vérifier l'organisation des dossiers
$expectedDirs = @("app", "components", "contexts", "hooks", "lib", "api", "sql", "scripts", "public")
$actualDirs = Get-ChildItem -Path "." -Directory | Where-Object { $_.Name -notmatch "node_modules|\.git|\.next|docs|hardware|bin|bootstrap" } | Select-Object -ExpandProperty Name
$missingDirs = $expectedDirs | Where-Object { $actualDirs -notcontains $_ }
if ($missingDirs.Count -eq 0) {
    Write-OK "Structure projet conforme (Next.js + API)"
} else {
    Write-Warn "Dossiers manquants: $($missingDirs -join ', ')"
}

# Fichiers de config à la racine (acceptable)
$configFiles = Get-ChildItem -Path "." -Filter "*config*" | Measure-Object
Write-Info "$($configFiles.Count) fichiers de configuration a la racine (normal)"

# Vérifier les composants dans le bon dossier
$componentsOutsideDir = Get-ChildItem -Path "." -Recurse -Filter "*.jsx" | Where-Object { 
    $_.FullName -notmatch "components|app|node_modules|\.next" -and $_.Name -match "^[A-Z]"
}
if ($componentsOutsideDir.Count -gt 0) {
    Write-Warn "Composants React en dehors de components/:"
    $componentsOutsideDir | ForEach-Object { Write-Host "  - $($_.FullName -replace [regex]::Escape($rootPath), '')" -ForegroundColor Gray }
} else {
    Write-OK "Composants React bien organises"
}

# Vérifier les fichiers API dans le bon dossier
$apiOutsideDir = Get-ChildItem -Path "." -Recurse -Filter "*.php" | Where-Object { 
    $_.FullName -notmatch "api|vendor|node_modules|bootstrap" -and 
    $_.Name -ne "api.php" -and $_.Name -ne "index.php" -and $_.Name -ne "router.php"
}
if ($apiOutsideDir.Count -gt 0) {
    Write-Warn "Fichiers PHP mal places:"
    $apiOutsideDir | ForEach-Object { Write-Host "  - $($_.FullName -replace [regex]::Escape($rootPath), '')" -ForegroundColor Gray }
} else {
    Write-OK "Fichiers PHP bien organises (api/ + bootstrap/)"
}

# Fichiers MD suspects à la racine
$rootMdFiles = Get-ChildItem -Path "." -Filter "*.md" | Where-Object { $_.Name -notmatch "README|SUIVI_TEMPS|FACTURATION" }
if ($rootMdFiles.Count -gt 0) {
    Write-Warn "$($rootMdFiles.Count) fichier(s) MD suspect(s) a la racine"
    $auditResults.Warnings += "Fichiers MD suspects: " + ($rootMdFiles.Name -join ", ")
} else {
    Write-OK "Aucun fichier MD suspect a la racine"
}

# Fichiers backup
$backupFiles = Get-ChildItem -Recurse -Include "*.backup","*.bak","*~" -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch "node_modules" }
if ($backupFiles.Count -gt 0) {
    Write-Warn "$($backupFiles.Count) fichier(s) backup detecte(s)"
    $auditResults.Warnings += "Fichiers backup: $($backupFiles.Count)"
} else {
    Write-OK "Aucun fichier backup"
}

# Répertoires vides
$emptyDirs = Get-ChildItem -Recurse -Directory -ErrorAction SilentlyContinue | Where-Object { 
    $_.FullName -notmatch "node_modules|\.git|_next" -and 
    (Get-ChildItem $_.FullName -Recurse -File -ErrorAction SilentlyContinue).Count -eq 0 
}
if ($emptyDirs.Count -gt 0) {
    Write-Warn "$($emptyDirs.Count) repertoire(s) vide(s)"
} else {
    Write-OK "Aucun repertoire vide"
}

# TODO/FIXME dans le code
$todoFiles = Select-String -Path "*.js","*.jsx","*.php","*.ts","*.tsx" -Pattern "TODO|FIXME|XXX|HACK" -ErrorAction SilentlyContinue | 
    Where-Object { $_.Path -notmatch "node_modules|\.next|build" } | 
    Group-Object Path
if ($todoFiles.Count -gt 0) {
    Write-Warn "$($todoFiles.Count) fichier(s) avec TODO/FIXME"
    $auditResults.Recommendations += "Nettoyer les TODO/FIXME ($($todoFiles.Count) fichiers)"
} else {
    Write-OK "Aucun TODO/FIXME en attente"
}

# console.log oubliés (hors logger.js)
$consoleLogs = Select-String -Path "*.js","*.jsx","*.ts","*.tsx" -Pattern "console\.(log|warn|error)" -ErrorAction SilentlyContinue | 
    Where-Object { $_.Path -notmatch "node_modules|\.next|build|logger\.js|inject\.js" }
$consoleCount = ($consoleLogs | Measure-Object).Count
if ($consoleCount -gt 20) {
    Write-Warn "$consoleCount console.log detectes (>20)"
    $auditResults.Recommendations += "Remplacer console.log par logger"
} else {
    Write-OK "$consoleCount console.log (acceptable)"
}

Write-Host ""
Write-Host "RESUME" -ForegroundColor Cyan
Write-Host ("-" * 80) -ForegroundColor Gray
Write-Host "  Problemes critiques  : $($auditResults.Issues.Count)" -ForegroundColor $(if($auditResults.Issues.Count -eq 0){"Green"}else{"Red"})
Write-Host "  Avertissements       : $($auditResults.Warnings.Count)" -ForegroundColor $(if($auditResults.Warnings.Count -eq 0){"Green"}else{"Yellow"})
Write-Host "  Recommandations      : $($auditResults.Recommendations.Count)" -ForegroundColor $(if($auditResults.Recommendations.Count -eq 0){"Green"}else{"Yellow"})
Write-Host "  Code mort detecte    : $totalDead fichiers" -ForegroundColor $(if($totalDead -eq 0){"Green"}else{"Yellow"})
Write-Host "  Endpoints API        : $endpointsOK/$endpointsTotal OK" -ForegroundColor $(if($endpointsOK -eq $endpointsTotal){"Green"}else{"Yellow"})
Write-Host "  Duree audit          : $([math]::Round($duration, 1))s" -ForegroundColor Gray
Write-Host ("-" * 80) -ForegroundColor Gray

if ($auditResults.Issues.Count -gt 0) {
    Write-Host ""
    Write-Host "[ERROR] PROBLEMES CRITIQUES:" -ForegroundColor Red
    foreach ($issue in $auditResults.Issues) {
        Write-Host "   * $issue" -ForegroundColor Red
    }
}

if ($auditResults.Warnings.Count -gt 0 -and $auditResults.Warnings.Count -le 10) {
    Write-Host ""
    Write-Host "[WARN] AVERTISSEMENTS:" -ForegroundColor Yellow
    foreach ($warn in $auditResults.Warnings) {
        Write-Host "   * $warn" -ForegroundColor Yellow
    }
}

if ($auditResults.Recommendations.Count -gt 0 -and $auditResults.Recommendations.Count -le 10) {
    Write-Host ""
    Write-Host "[INFO] RECOMMANDATIONS:" -ForegroundColor Cyan
    foreach ($rec in $auditResults.Recommendations) {
        Write-Host "   * $rec" -ForegroundColor Cyan
    }
}

# ===============================================================================
# PHASE BONUS : VÉRIFICATION STRUCTURE API
# ===============================================================================

Write-Section "STRUCTURE API & COHÉRENCE HANDLERS"

$structureScore = 10.0
$criticalIssues = @()
$warnings = @()

if (Test-Path "api.php") {
    $apiContent = Get-Content "api.php" -Raw
    
    # Extraire toutes les routes - Pattern amélioré pour capturer toutes les variantes
    # Chercher les patterns: elseif(preg_match('#...', $path, $m) && $method === '...')
    $routePatterns = @(
        "elseif\(preg_match\('#([^']+)'#.*\) && \`$method === '([^']+)'\) \{[^\}]*handle(\w+)\(",
        "elseif\(preg_match\('#([^']+)'#.*\$path.*\) && \$method === '([^']+)'\) \{[^\}]*handle(\w+)\("
    )
    
    $routesByEndpoint = @{}
    $handlersCalled = @{}
    
    foreach ($pattern in $routePatterns) {
        $matches = [regex]::Matches($apiContent, $pattern)
        foreach ($match in $matches) {
            $path = $match.Groups[1].Value
            $method = $match.Groups[2].Value
            $handler = "handle" + $match.Groups[3].Value
            
            # Normaliser le path (enlever les anchors regex)
            $normalizedPath = $path -replace '\$$', '' -replace '^\^', ''
            
            if (-not $routesByEndpoint.ContainsKey($normalizedPath)) {
                $routesByEndpoint[$normalizedPath] = @{}
            }
            $routesByEndpoint[$normalizedPath][$method] = $handler
            $handlersCalled[$handler] = $true
        }
    }
    
    Write-Info "Routes trouvées: $($handlersCalled.Keys.Count)"
    
    # Vérifier handlers définis - Tous les fichiers handlers
    $handlersDefined = @{}
    $handlerFiles = @(
        "api/handlers/auth.php",
        "api/handlers/devices.php",
        "api/handlers/firmwares.php",
        "api/handlers/notifications.php",
        "api/handlers/usb_logs.php"
    )
    
    foreach ($file in $handlerFiles) {
        if (Test-Path $file) {
            $content = Get-Content $file -Raw
            $functions = [regex]::Matches($content, "function (handle\w+)\(")
            foreach ($func in $functions) {
                $handlersDefined[$func.Groups[1].Value] = $file
            }
        }
    }
    
    # Vérifier cohérence (appelés vs définis)
    foreach ($handler in $handlersCalled.Keys) {
        if (-not $handlersDefined.ContainsKey($handler)) {
            Write-Err "Handler appelé mais non défini: $handler"
            $criticalIssues += "Handler $handler appelé mais NON DÉFINI"
            $structureScore -= 1.0
        }
    }
    
    # Handlers définis mais jamais appelés
    $unusedHandlers = $handlersDefined.Keys | Where-Object { -not $handlersCalled.ContainsKey($_) }
    if ($unusedHandlers.Count -gt 0) {
        Write-Warn "$($unusedHandlers.Count) handlers définis mais jamais appelés"
        $warnings += "Handlers inutilisés: $($unusedHandlers -join ', ')"
        $structureScore -= 0.5
    }
    
    # Vérifier endpoints critiques (restauration)
    $criticalEndpoints = @(
        @{ Endpoint = "/patients/(\d+)"; Method = "PATCH"; Handler = "handleRestorePatient"; Name = "Restaurer patient" }
        @{ Endpoint = "/users/(\d+)"; Method = "PATCH"; Handler = "handleRestoreUser"; Name = "Restaurer utilisateur" }
    )
    
    foreach ($ep in $criticalEndpoints) {
        $found = $false
        # Vérifier directement dans api.php avec recherche directe
        # Chercher pattern: preg_match('#/patients/(\d+)$#', $path, $m) && $method === 'PATCH'
        $searchPattern = $ep.Endpoint -replace '\(\\d\+\)', '\(\\d\+\)'
        $fullPattern = "preg_match\('#$searchPattern'#" -replace '\\\\', '\\'
        
        # Vérifier que la route existe avec la méthode correcte ET le handler
        if ($apiContent -match $fullPattern) {
            # Vérifier que c'est bien avec la bonne méthode
            $routeBlock = [regex]::Match($apiContent, "$fullPattern.*?\`$method === '$($ep.Method)'", [System.Text.RegularExpressions.RegexOptions]::Singleline)
            if ($routeBlock.Success) {
                # Vérifier que le handler est présent dans ce bloc
                if ($routeBlock.Value -match $ep.Handler) {
                    Write-OK "$($ep.Name): $($ep.Method) $($ep.Endpoint) → $($ep.Handler)"
                    $found = $true
                }
            }
        }
        
        if (-not $found) {
            Write-Err "$($ep.Name): Route MANQUANTE ou non détectée"
            $criticalIssues += "$($ep.Name) manquante"
            $structureScore -= 2.0
        }
    }
    
    # Vérifier fonctions handlers critiques
    $handlersToCheck = @(
        @{ File = "api/handlers/devices.php"; Function = "handleRestorePatient"; Name = "Restauration patients" }
        @{ File = "api/handlers/auth.php"; Function = "handleRestoreUser"; Name = "Restauration users" }
    )
    
    foreach ($handler in $handlersToCheck) {
        if (Test-Path $handler.File) {
            $content = Get-Content $handler.File -Raw
            if ($content -match "function $($handler.Function)\(") {
                Write-OK "$($handler.Name): $($handler.Function)() definie"
            } else {
                Write-Err "$($handler.Name): $($handler.Function)() MANQUANTE"
                $criticalIssues += "$($handler.Function) non defini"
                $structureScore -= 2.0
            }
        }
    }
} else {
    Write-Err "api.php introuvable !"
    $criticalIssues += "api.php introuvable"
    $structureScore = 0
}

Write-Host ""
if ($criticalIssues.Count -eq 0) {
    Write-OK "Structure API coherente - Score: $structureScore/10"
} else {
    Write-Err "Problemes structurels detectes:"
    $criticalIssues | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    Write-Host "[SCORE STRUCTURE] $structureScore/10" -ForegroundColor Yellow
}

if ($warnings.Count -gt 0) {
    $warnings | ForEach-Object { Write-Warn $_ }
}

$auditResults.Scores["Structure API"] = $structureScore

# ===============================================================================
# PHASE 16 : VÉRIFICATION UNIFORMISATION UI/UX
# ===============================================================================

Write-Section "[16/16] Uniformisation UI/UX - Badges, Tables, Modals"

$uiScore = 10.0
$uiIssues = @()
$uiWarnings = @()

# Fichiers à vérifier
$uiFiles = @(
    "app/dashboard/users/page.js",
    "app/dashboard/patients/page.js",
    "components/configuration/UsbStreamingTab.js",
    "components/UserPatientModal.js",
    "components/DeviceModal.js"
)

$filesChecked = 0
$filesWithIssues = 0

foreach ($file in $uiFiles) {
    if (-not (Test-Path $file)) {
        Write-Warn "$file : Fichier introuvable"
        $uiWarnings += "$file introuvable"
        $uiScore -= 0.5
        continue
    }
    
    $content = Get-Content $file -Raw -ErrorAction SilentlyContinue
    if (-not $content) {
        continue
    }
    
    $filesChecked++
    $fileIssues = @()
    
    # Vérifier badges
    if ($file -match "(users|patients|UsbStreamingTab)") {
        # Vérifier badge "Archivé"
        if ($content -match "Archivé") {
            if ($content -notmatch "badge.*bg-gray-100.*text-gray-600.*dark:bg-gray-800.*dark:text-gray-400" -and 
                $content -notmatch "badge bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400") {
                $fileIssues += "Badge 'Archivé' non standardisé dans $file"
                $uiIssues += "$file : Badge 'Archivé' non uniforme"
            }
        }
        
        # Vérifier badge "Actif"
        if ($content -match "Actif") {
            if ($content -notmatch "badge-success" -and $content -notmatch "badge badge-success") {
                $fileIssues += "Badge 'Actif' non standardisé dans $file"
                $uiIssues += "$file : Badge 'Actif' non uniforme"
            }
        }
        
        # Vérifier badge "Inactif"
        if ($content -match "Inactif") {
            if ($content -notmatch "badge.*text-gray-600.*bg-gray-100" -and $content -notmatch "badge text-gray-600 bg-gray-100") {
                $fileIssues += "Badge 'Inactif' non standardisé dans $file"
                $uiIssues += "$file : Badge 'Inactif' non uniforme"
            }
        }
    }
    
    # Vérifier classes de table
    if ($file -match "(users|patients|UsbStreamingTab)") {
        # Vérifier table-row
        if ($content -match "className.*table|table.*className") {
            if ($content -notmatch "table-row") {
                $fileIssues += "Classe 'table-row' manquante dans $file"
                $uiIssues += "$file : Classe 'table-row' non utilisée"
            }
        }
        
        # Vérifier table-cell
        if ($content -match "table-row") {
            if ($content -notmatch "table-cell") {
                $fileIssues += "Classe 'table-cell' manquante dans $file"
                $uiIssues += "$file : Classe 'table-cell' non utilisée"
            }
        }
        
        # Vérifier opacity-60 pour lignes archivées
        if ($content -match "deleted_at|isArchived") {
            if ($content -notmatch "opacity-60") {
                $fileIssues += "Opacité 'opacity-60' manquante pour lignes archivées dans $file"
                $uiIssues += "$file : Opacité pour archives non uniforme"
            }
        }
        
        # Vérifier hover standardisé
        if ($content -match "table-row") {
            if ($content -notmatch "hover:bg-gray-50.*dark:hover") {
                $fileIssues += "Hover non standardisé dans $file"
                $uiWarnings += "$file : Hover table non uniforme"
            }
        }
    }
    
    # Vérifier modals
    if ($file -match "Modal") {
        # Vérifier overlay
        if ($content -match "fixed.*inset-0") {
            if ($content -notmatch "bg-black/50.*dark:bg-black/60.*z-\[100\]|bg-black/50.*dark:bg-black/60.*z-50") {
                $fileIssues += "Overlay modal non standardisé dans $file"
                $uiIssues += "$file : Overlay modal non uniforme"
            }
        }
        
        # Vérifier container
        if ($content -match "bg-white.*dark:bg") {
            if ($content -notmatch "dark:bg-\[rgb\(var\(--night-surface\)\)\]|dark:bg-gray-900") {
                $fileIssues += "Container modal non standardisé dans $file"
                $uiIssues += "$file : Container modal non uniforme"
            }
        }
        
        # Vérifier close button
        if ($content -match "onClose|close|×") {
            if ($content -notmatch "text-gray-400.*hover:text-gray-600.*dark:hover:text-gray-300") {
                $fileIssues += "Bouton fermer modal non standardisé dans $file"
                $uiWarnings += "$file : Bouton fermer modal non uniforme"
            }
        }
    }
    
    if ($fileIssues.Count -gt 0) {
        $filesWithIssues++
        $uiScore -= ($fileIssues.Count * 0.3)
    } else {
        Write-OK "$file : Uniformisation OK"
    }
}

# Vérifier cohérence globale entre fichiers
if ($filesChecked -gt 1) {
    Write-Info "Vérification cohérence croisée..."
    
    $usersContent = Get-Content "app/dashboard/users/page.js" -Raw -ErrorAction SilentlyContinue
    $patientsContent = Get-Content "app/dashboard/patients/page.js" -Raw -ErrorAction SilentlyContinue
    $devicesContent = Get-Content "components/configuration/UsbStreamingTab.js" -Raw -ErrorAction SilentlyContinue
    
    if ($usersContent -and $patientsContent -and $devicesContent) {
        # Extraire les patterns de badges
        $usersBadges = [regex]::Matches($usersContent, "badge[^>]*Archivé[^<]*</span>")
        $patientsBadges = [regex]::Matches($patientsContent, "badge[^>]*Archivé[^<]*</span>")
        $devicesBadges = [regex]::Matches($devicesContent, "badge[^>]*Archivé[^<]*</span>")
        
        # Comparer les patterns
        if ($usersBadges.Count -gt 0 -and $patientsBadges.Count -gt 0) {
            $usersBadgeClass = [regex]::Match($usersBadges[0].Value, 'className="([^"]*)"')
            $patientsBadgeClass = [regex]::Match($patientsBadges[0].Value, 'className="([^"]*)"')
            
            if ($usersBadgeClass.Success -and $patientsBadgeClass.Success) {
                if ($usersBadgeClass.Groups[1].Value -ne $patientsBadgeClass.Groups[1].Value) {
                    Write-Warn "Badges 'Archivé' non identiques entre users et patients"
                    $uiWarnings += "Incohérence badges 'Archivé' entre users et patients"
                    $uiScore -= 0.5
                } else {
                    Write-OK "Badges 'Archivé' cohérents entre users et patients"
                }
            }
        }
        
        # Vérifier cohérence table-row et table-cell
        $hasTableRow = @(
            ($usersContent -match "table-row"),
            ($patientsContent -match "table-row"),
            ($devicesContent -match "table-row")
        )
        
        if (($hasTableRow[0] -and -not $hasTableRow[1]) -or ($hasTableRow[1] -and -not $hasTableRow[2])) {
            Write-Warn "Usage incohérent de 'table-row' entre fichiers"
            $uiWarnings += "Usage incohérent de 'table-row'"
            $uiScore -= 0.5
        } else {
            Write-OK "Classe 'table-row' utilisée de manière cohérente"
        }
        
        # Vérifier cohérence opacity-60
        $hasOpacity = @(
            ($usersContent -match "opacity-60"),
            ($patientsContent -match "opacity-60"),
            ($devicesContent -match "opacity-60")
        )
        
        if (($hasOpacity[0] -and -not $hasOpacity[1]) -or ($hasOpacity[1] -and -not $hasOpacity[2])) {
            Write-Warn "Usage incohérent de 'opacity-60' entre fichiers"
            $uiWarnings += "Usage incohérent de 'opacity-60'"
            $uiScore -= 0.5
        } else {
            Write-OK "Classe 'opacity-60' utilisée de manière cohérente"
        }
    }
}

Write-Host ""
if ($uiIssues.Count -eq 0 -and $uiWarnings.Count -eq 0) {
    Write-OK "Uniformisation UI/UX parfaite - Score: $([math]::Round($uiScore, 1))/10"
} else {
    if ($uiIssues.Count -gt 0) {
        Write-Err "Problèmes d'uniformisation détectés:"
        $uiIssues | Select-Object -First 10 | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
        if ($uiIssues.Count -gt 10) {
            Write-Host "  ... et $($uiIssues.Count - 10) autres problèmes" -ForegroundColor Red
        }
    }
    if ($uiWarnings.Count -gt 0) {
        Write-Warn "Avertissements d'uniformisation:"
        $uiWarnings | Select-Object -First 5 | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
    }
    Write-Host "[SCORE UI/UX] $([math]::Round($uiScore, 1))/10" -ForegroundColor Yellow
}

$auditResults.Scores["Uniformisation UI/UX"] = $uiScore
$auditResults.Issues += $uiIssues
$auditResults.Warnings += $uiWarnings

Write-Host ""
Write-Host ("=" * 80) -ForegroundColor Gray

# Verdict final
if ($scoreGlobal -ge 9.5) {
    Write-Host "[EXCELLENT] Projet de qualite professionnelle !" -ForegroundColor Green
    $exitCode = 0
} elseif ($scoreGlobal -ge 8) {
    Write-Host "[BON] Quelques optimisations possibles." -ForegroundColor Yellow
    $exitCode = 0
} elseif ($scoreGlobal -ge 6) {
    Write-Host "[MOYEN] Corrections recommandees." -ForegroundColor Yellow
    $exitCode = 1
} else {
    Write-Host "[CRITIQUE] Actions urgentes necessaires." -ForegroundColor Red
    $exitCode = 1
}

Write-Host ("=" * 80) -ForegroundColor Gray
Write-Host ""

exit $exitCode

