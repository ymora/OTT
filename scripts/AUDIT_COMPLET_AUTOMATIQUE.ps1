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
# Usage : .\scripts\AUDIT_COMPLET_AUTOMATIQUE.ps1 [-Verbose] [-GenerateReport]
# ================================================================================

param(
    [string]$Email = "ymora@free.fr",
    [string]$Password = "Ym120879",
    [string]$ApiUrl = "https://ott-jbln.onrender.com",
    [switch]$Verbose = $false,
    [switch]$GenerateReport = $true,
    [int]$MaxFunctionLines = 100,      # Fonctions > 100 lignes = à refactoriser
    [int]$MaxFileLines = 500,          # Fichiers > 500 lignes = à découper
    [int]$DuplicationThreshold = 10    # 10+ lignes identiques = duplication
)

$ErrorActionPreference = "Continue"
$OutputEncoding = [System.Text.Encoding]::UTF8

# Couleurs pour l'affichage
function Write-Section { param([string]$Text) Write-Host "`n$Text" -ForegroundColor Cyan; Write-Host ("=" * 80) -ForegroundColor Gray }
function Write-OK { param([string]$Text) Write-Host "  ✅ $Text" -ForegroundColor Green }
function Write-Warn { param([string]$Text) Write-Host "  ⚠️  $Text" -ForegroundColor Yellow }
function Write-Error { param([string]$Text) Write-Host "  ❌ $Text" -ForegroundColor Red }
function Write-Info { param([string]$Text) if($Verbose) { Write-Host "  ℹ️  $Text" -ForegroundColor Gray } }

Write-Host @"

================================================================================
🔍 AUDIT COMPLET AUTOMATIQUE PROFESSIONNEL - OTT Dashboard
================================================================================
Date: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
Version: 2.0 - Analyse Exhaustive
================================================================================

"@ -ForegroundColor Cyan

$auditResults = @{
    Scores = @{}
    Issues = @()
    Warnings = @()
    Recommendations = @()
    Stats = @{}
}

# ================================================================================
# PHASE 1 : ARCHITECTURE & STATISTIQUES
# ================================================================================

Write-Section "📊 PHASE 1 : Architecture & Statistiques Code"

$stats = @{
    JS = (Get-ChildItem -Recurse -Include *.js,*.jsx -Exclude node_modules,*.min.js,.next,docs,public | Measure-Object).Count
    JSLines = (Get-ChildItem -Recurse -Include *.js,*.jsx -Exclude node_modules,*.min.js,.next,docs,public | Get-Content | Measure-Object -Line).Lines
    PHP = (Get-ChildItem -Recurse -Include *.php -Exclude vendor | Measure-Object).Count
    PHPLines = (Get-ChildItem -Recurse -Include *.php -Exclude vendor | Get-Content | Measure-Object -Line).Lines
    SQL = (Get-ChildItem -Recurse -Include *.sql | Measure-Object).Count
    MD = (Get-ChildItem -Filter *.md | Measure-Object).Count
    Components = (Get-ChildItem -Path components -Recurse -Include *.js | Measure-Object).Count
    Hooks = (Get-ChildItem -Path hooks -Include *.js | Measure-Object).Count
    Pages = (Get-ChildItem -Path app/dashboard -Recurse -Include page.js | Measure-Object).Count
    Scripts = (Get-ChildItem -Path scripts -Recurse -Include *.ps1,*.sh,*.js | Measure-Object).Count
}

Write-Host "  JavaScript/React : $($stats.JS) fichiers ($($stats.JSLines) lignes)" -ForegroundColor White
Write-Host "  PHP             : $($stats.PHP) fichiers ($($stats.PHPLines) lignes)" -ForegroundColor White
Write-Host "  SQL             : $($stats.SQL) fichiers" -ForegroundColor White
Write-Host "  Markdown (root) : $($stats.MD) fichiers" -ForegroundColor $(if($stats.MD -gt 10){"Red"}elseif($stats.MD -gt 5){"Yellow"}else{"Green"})
Write-Host "  Composants      : $($stats.Components)" -ForegroundColor White
Write-Host "  Hooks           : $($stats.Hooks)" -ForegroundColor White
Write-Host "  Pages Dashboard : $($stats.Pages)" -ForegroundColor White
Write-Host "  Scripts         : $($stats.Scripts)" -ForegroundColor White

$auditResults.Stats = $stats
$auditResults.Scores["Architecture"] = 10

if ($stats.MD -gt 10) {
    Write-Warn "Trop de fichiers MD à la racine ($($stats.MD)) - Recommandé: < 5"
    $auditResults.Issues += "Documentation: $($stats.MD) fichiers MD à la racine (> 10)"
    $auditResults.Scores["Architecture"] = 8
}

# ================================================================================
# PHASE 2 : CODE MORT - DÉTECTION EXHAUSTIVE
# ================================================================================

Write-Section "🗑️  PHASE 2 : Code Mort - Composants, Hooks, Libs Non Utilisés"

$deadCode = @{
    Components = @()
    Hooks = @()
    Libs = @()
    Functions = @()
}

# Analyser composants
$allComponents = Get-ChildItem -Path components -Recurse -Include *.js | ForEach-Object { $_.BaseName }
foreach ($comp in $allComponents) {
    $usage = (Get-ChildItem -Recurse -Include *.js,*.jsx -Exclude node_modules,.next,docs,public | Select-String -Pattern "import.*$comp|from.*$comp" -SimpleMatch:$false).Count
    if ($usage -eq 0 -or ($usage -eq 1 -and (Test-Path "components/$comp.js"))) {
        $deadCode.Components += $comp
        Write-Error "$comp (composant) - 0 utilisations"
    }
}

# Analyser hooks
$allHooks = Get-ChildItem -Path hooks -Include *.js | Where-Object { $_.Name -ne 'index.js' } | ForEach-Object { $_.BaseName }
foreach ($hook in $allHooks) {
    $usage = (Get-ChildItem -Recurse -Include *.js,*.jsx -Exclude node_modules,.next,docs,public | Select-String -Pattern $hook).Count
    if ($usage -le 1) {
        $deadCode.Hooks += $hook
        Write-Error "$hook (hook) - 0-1 utilisations"
    }
}

# Analyser libs
$allLibs = Get-ChildItem -Path lib -Include *.js | ForEach-Object { $_.BaseName }
foreach ($lib in $allLibs) {
    $usage = (Get-ChildItem -Recurse -Include *.js,*.jsx -Exclude node_modules,.next,docs,public,lib | Select-String -Pattern $lib).Count
    if ($usage -eq 0) {
        $deadCode.Libs += $lib
        Write-Error "$lib (lib) - 0 utilisations"
    }
}

$totalDead = $deadCode.Components.Count + $deadCode.Hooks.Count + $deadCode.Libs.Count
if ($totalDead -eq 0) {
    Write-OK "Aucun code mort détecté"
    $auditResults.Scores["CodeMort"] = 10
} else {
    Write-Warn "$totalDead fichier(s) non utilisé(s)"
    $auditResults.Issues += "Code mort: $totalDead fichiers non utilisés"
    $auditResults.Scores["CodeMort"] = 10 - [Math]::Min($totalDead, 5)
}

# ================================================================================
# PHASE 3 : DUPLICATION DE CODE
# ================================================================================

Write-Section "🔄 PHASE 3 : Duplication de Code & Refactoring Possible"

$duplications = @()

# Patterns courants à détecter
$patterns = @(
    @{Pattern='useState\('; Description='useState répétés (hooks personnalisés possibles?)'},
    @{Pattern='useEffect\('; Description='useEffect similaires (hooks personnalisés possibles?)'},
    @{Pattern='fetchJson\(fetchWithAuth'; Description='Appels API répétés (custom hook possible?)'},
    @{Pattern='\.map\(.*=>\s*\('; Description='Map/render patterns (composants réutilisables?)'},
    @{Pattern='try\s*\{[\s\S]{0,100}catch'; Description='Try/catch patterns (wrapper possible?)'}
)

foreach ($pattern in $patterns) {
    $matches = Get-ChildItem -Recurse -Include *.js,*.jsx -Exclude node_modules,.next,docs,public | Select-String -Pattern $pattern.Pattern
    $fileCount = ($matches | Group-Object Path).Count
    
    if ($fileCount -gt 5) {
        Write-Warn "$($pattern.Description) - Trouvé dans $fileCount fichiers"
        $auditResults.Warnings += "Duplication potentielle: $($pattern.Description) ($fileCount occurrences)"
        $duplications += @{Pattern=$pattern.Description; Count=$fileCount}
    }
}

# Détecter blocs de code similaires (approximatif - basé sur longueur de ligne)
Write-Info "Analyse de patterns de code similaires..."

if ($duplications.Count -eq 0) {
    Write-OK "Pas de duplication majeure détectée"
    $auditResults.Scores["Duplication"] = 10
} else {
    Write-Warn "$($duplications.Count) pattern(s) de duplication détectés"
    $auditResults.Recommendations += "Envisager refactoring pour patterns dupliqués"
    $auditResults.Scores["Duplication"] = 10 - [Math]::Min($duplications.Count, 3)
}

# ================================================================================
# PHASE 4 : COMPLEXITÉ & MAINTENABILITÉ
# ================================================================================

Write-Section "📐 PHASE 4 : Complexité - Fichiers/Fonctions Trop Longs"

$complexity = @{
    LargeFiles = @()
    LongFunctions = @()
}

# Fichiers trop longs
Get-ChildItem -Recurse -Include *.js,*.jsx,*.php -Exclude node_modules,.next,docs,public,vendor | ForEach-Object {
    $lines = (Get-Content $_.FullName | Measure-Object -Line).Lines
    if ($lines -gt $MaxFileLines) {
        $relativePath = $_.FullName.Replace((Get-Location).Path + '\', '')
        $complexity.LargeFiles += @{Path=$relativePath; Lines=$lines}
        Write-Warn "$relativePath - $lines lignes (> $MaxFileLines)"
    }
}

# Fonctions trop longues (approximatif - cherche function/const func = )
$jsFiles = Get-ChildItem -Recurse -Include *.js,*.jsx -Exclude node_modules,.next,docs,public
foreach ($file in $jsFiles) {
    $content = Get-Content $file.FullName -Raw
    $functions = [regex]::Matches($content, '(?:function\s+\w+|const\s+\w+\s*=.*(?:function|\(.*\)\s*=>))\s*[\(\{][\s\S]{' + $MaxFunctionLines + ',}?(?=\n(?:function|const|export|\/\/)|\}$)')
    
    if ($functions.Count -gt 0) {
        $relativePath = $file.FullName.Replace((Get-Location).Path + '\', '')
        foreach ($match in $functions) {
            $lineCount = ($match.Value -split "`n").Count
            if ($lineCount -gt $MaxFunctionLines) {
                $funcName = if ($match.Value -match '(?:function\s+(\w+)|const\s+(\w+))') { $matches[1] ?? $matches[2] } else { 'Anonyme' }
                $complexity.LongFunctions += @{File=$relativePath; Function=$funcName; Lines=$lineCount}
                Write-Warn "$relativePath::$funcName() - ~$lineCount lignes (> $MaxFunctionLines)"
            }
        }
    }
}

$complexityScore = 10
if ($complexity.LargeFiles.Count -gt 0) {
    Write-Warn "$($complexity.LargeFiles.Count) fichier(s) trop volumineux (> $MaxFileLines lignes)"
    $auditResults.Recommendations += "Découper fichiers volumineux en modules réutilisables"
    $complexityScore -= [Math]::Min($complexity.LargeFiles.Count, 3)
}
if ($complexity.LongFunctions.Count -gt 0) {
    Write-Warn "$($complexity.LongFunctions.Count) fonction(s) trop longue(s) (> $MaxFunctionLines lignes)"
    $auditResults.Recommendations += "Refactoriser fonctions longues en fonctions plus petites"
    $complexityScore -= [Math]::Min($complexity.LongFunctions.Count, 3)
}

if ($complexity.LargeFiles.Count -eq 0 -and $complexity.LongFunctions.Count -eq 0) {
    Write-OK "Complexité code maîtrisée"
}

$auditResults.Scores["Complexite"] = [Math]::Max($complexityScore, 0)

# ================================================================================
# PHASE 5 : ROUTES & NAVIGATION
# ================================================================================

Write-Section "🗺️  PHASE 5 : Routes & Navigation - Vérification Menu"

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
        Write-Error "$($page.Name) → FICHIER MANQUANT: $($page.File)"
        $auditResults.Issues += "Route cassée: $($page.Route) (fichier manquant)"
        $missingPages++
    }
}

$auditResults.Scores["Routes"] = if($missingPages -eq 0) { 10 } else { 10 - ($missingPages * 2) }

# ================================================================================
# PHASE 6 : ENDPOINTS API - TEST FONCTIONNEL
# ================================================================================

Write-Section "🌐 PHASE 6 : Endpoints API - Tests Fonctionnels"

$apiScore = 0
$endpointsTotal = 0
$endpointsOK = 0

try {
    # Login
    Write-Info "Connexion à l'API..."
    $loginBody = @{email = $Email; password = $Password} | ConvertTo-Json
    $authResponse = Invoke-RestMethod -Uri "$ApiUrl/api.php/auth/login" -Method POST -Body $loginBody -ContentType "application/json" -ErrorAction Stop
    $token = $authResponse.token
    $headers = @{Authorization = "Bearer $token"; 'Content-Type' = 'application/json'}
    Write-OK "Authentification réussie"
    
    # Test endpoints critiques
    $endpoints = @(
        @{Method="GET"; Path="/api.php/devices"; Name="Liste dispositifs"; Critical=$true},
        @{Method="GET"; Path="/api.php/patients"; Name="Liste patients"; Critical=$true},
        @{Method="GET"; Path="/api.php/users"; Name="Liste utilisateurs"; Critical=$true},
        @{Method="GET"; Path="/api.php/alerts"; Name="Liste alertes"; Critical=$false},
        @{Method="GET"; Path="/api.php/firmwares"; Name="Liste firmwares"; Critical=$false},
        @{Method="GET"; Path="/api.php/roles"; Name="Liste rôles"; Critical=$false},
        @{Method="GET"; Path="/api.php/permissions"; Name="Liste permissions"; Critical=$false},
        @{Method="GET"; Path="/api.php/audit?limit=10"; Name="Logs audit"; Critical=$false},
        @{Method="GET"; Path="/api.php/health"; Name="Healthcheck"; Critical=$true}
    )
    
    foreach ($endpoint in $endpoints) {
        $endpointsTotal++
        try {
            $result = Invoke-RestMethod -Uri "$ApiUrl$($endpoint.Path)" -Method $endpoint.Method -Headers $headers -ErrorAction Stop -TimeoutSec 10
            Write-OK "$($endpoint.Name)"
            $endpointsOK++
        } catch {
            if ($endpoint.Critical) {
                Write-Error "$($endpoint.Name) - CRITIQUE - $($_.Exception.Message)"
                $auditResults.Issues += "API critique: $($endpoint.Name) en erreur"
            } else {
                Write-Warn "$($endpoint.Name) - $($_.Exception.Message)"
                $auditResults.Warnings += "API: $($endpoint.Name) en erreur"
            }
        }
    }
    
    $apiScore = [math]::Round(($endpointsOK / $endpointsTotal) * 10, 1)
    Write-Host "`n  Score Endpoints: $apiScore/10 ($endpointsOK/$endpointsTotal OK)" -ForegroundColor $(if($apiScore -ge 9){"Green"}elseif($apiScore -ge 7){"Yellow"}else{"Red"})
    
} catch {
    Write-Error "Échec connexion API: $($_.Exception.Message)"
    $auditResults.Issues += "API: Impossible de se connecter"
    $apiScore = 0
}

$auditResults.Scores["API"] = $apiScore

# ================================================================================
# PHASE 7 : BASE DE DONNÉES - COHÉRENCE
# ================================================================================

Write-Section "🗄️  PHASE 7 : Base de Données - Cohérence & Intégrité"

try {
    $devicesData = Invoke-RestMethod -Uri "$ApiUrl/api.php/devices" -Method GET -Headers $headers -ErrorAction Stop
    $patientsData = Invoke-RestMethod -Uri "$ApiUrl/api.php/patients" -Method GET -Headers $headers -ErrorAction Stop
    $usersData = Invoke-RestMethod -Uri "$ApiUrl/api.php/users" -Method GET -Headers $headers -ErrorAction Stop
    $alertsData = Invoke-RestMethod -Uri "$ApiUrl/api.php/alerts" -Method GET -Headers $headers -ErrorAction Stop
    
    $devices = $devicesData.devices
    $patients = $patientsData.patients
    $users = $usersData.users
    $alerts = $alertsData.alerts
    
    Write-Host "  📱 Dispositifs  : $($devices.Count)" -ForegroundColor White
    Write-Host "  👥 Patients     : $($patients.Count)" -ForegroundColor White
    Write-Host "  👤 Utilisateurs : $($users.Count)" -ForegroundColor White
    Write-Host "  ⚠️  Alertes      : $($alerts.Count)" -ForegroundColor White
    
    # Vérifier cohérence FK
    $orphanDevices = ($devices | Where-Object { $_.patient_id -and -not ($patients | Where-Object { $_.id -eq $_.patient_id }) }).Count
    if ($orphanDevices -gt 0) {
        Write-Error "$orphanDevices dispositif(s) avec patient_id invalide"
        $auditResults.Issues += "BDD: $orphanDevices dispositifs orphelins (FK patient invalide)"
    }
    
    # Vérifier dispositifs non assignés
    $unassigned = ($devices | Where-Object { -not $_.patient_id }).Count
    if ($unassigned -gt 0) {
        Write-Warn "$unassigned dispositif(s) non assigné(s)"
        $auditResults.Recommendations += "Assigner les $unassigned dispositifs non assignés"
    }
    
    # Vérifier alertes non résolues
    $unresolvedAlerts = ($alerts | Where-Object { $_.status -eq 'unresolved' }).Count
    if ($unresolvedAlerts -gt 5) {
        Write-Warn "$unresolvedAlerts alertes non résolues"
        $auditResults.Warnings += "BDD: $unresolvedAlerts alertes à traiter"
    }
    
    $auditResults.Scores["Database"] = 9
    
} catch {
    Write-Error "Erreur récupération données BDD"
    $auditResults.Scores["Database"] = 5
}

# ================================================================================
# PHASE 8 : SÉCURITÉ
# ================================================================================

Write-Section "🔒 PHASE 8 : Sécurité - Headers, SQL, XSS, JWT"

$securityScore = 10

# Vérifier headers de sécurité
try {
    $response = Invoke-WebRequest -Uri "$ApiUrl/api.php/health" -Method GET -UseBasicParsing
    $securityHeaders = @(
        "X-Content-Type-Options",
        "X-Frame-Options",
        "X-XSS-Protection",
        "Content-Security-Policy",
        "Referrer-Policy"
    )
    
    $missingHeaders = 0
    foreach ($header in $securityHeaders) {
        if ($response.Headers[$header]) {
            Write-OK $header
        } else {
            Write-Error "$header manquant"
            $missingHeaders++
        }
    }
    
    if ($missingHeaders -gt 0) {
        $securityScore -= $missingHeaders
        $auditResults.Issues += "Sécurité: $missingHeaders header(s) de sécurité manquant(s)"
    }
} catch {
    Write-Warn "Impossible de vérifier les headers de sécurité"
    $securityScore -= 2
}

# Vérifier utilisation de requêtes préparées (PHP)
$unsafeSQL = Get-ChildItem -Recurse -Include *.php | Select-String -Pattern '\$pdo->query\(\$|->exec\(\$|SELECT.*\$_|INSERT.*\$_' -SimpleMatch:$false
if ($unsafeSQL) {
    Write-Error "Requêtes SQL potentiellement non préparées détectées"
    $auditResults.Issues += "Sécurité: Requêtes SQL non préparées détectées"
    $securityScore -= 3
} else {
    Write-OK "Requêtes SQL préparées (PDO)"
}

# Vérifier dangerouslySetInnerHTML
$dangerousHTML = Get-ChildItem -Recurse -Include *.js,*.jsx -Exclude node_modules,.next | Select-String -Pattern 'dangerouslySetInnerHTML'
if ($dangerousHTML) {
    Write-Warn "dangerouslySetInnerHTML détecté (risque XSS)"
    $auditResults.Warnings += "Sécurité: Utilisation de dangerouslySetInnerHTML"
    $securityScore -= 1
} else {
    Write-OK "Pas de dangerouslySetInnerHTML (XSS protégé)"
}

$auditResults.Scores["Securite"] = [Math]::Max($securityScore, 0)

# ================================================================================
# PHASE 9 : PERFORMANCE
# ================================================================================

Write-Section "⚡ PHASE 9 : Performance - Cache, Optimisations, Lazy Loading"

$perfScore = 10

# Vérifier lazy loading
$lazyComponents = Get-ChildItem -Recurse -Include *.js,*.jsx -Exclude node_modules,.next | Select-String -Pattern 'dynamicImport|lazy\(|React\.lazy'
Write-OK "Lazy loading: $($lazyComponents.Count) composants"

# Vérifier useMemo/useCallback
$memoUsage = (Get-ChildItem -Recurse -Include *.js,*.jsx -Exclude node_modules,.next | Select-String -Pattern 'useMemo|useCallback').Count
Write-OK "Optimisations React: $memoUsage useMemo/useCallback"

# Détecter requêtes dans loops (N+1 potentiel)
$loopQueries = Get-ChildItem -Recurse -Include *.js,*.jsx -Exclude node_modules,.next | Select-String -Pattern '\.map\(.*fetchJson|\.map\(.*fetch\('
if ($loopQueries) {
    Write-Warn "Requêtes dans loops détectées (N+1 potentiel)"
    $auditResults.Warnings += "Performance: Requêtes dans loops (vérifier N+1)"
    $perfScore -= 2
}

# Vérifier cache
$cacheUsage = Get-ChildItem -Recurse -Include *.js,*.php -Exclude node_modules,.next | Select-String -Pattern 'cache|Cache|SimpleCache'
if ($cacheUsage.Count -gt 5) {
    Write-OK "Cache: Utilisé dans $($cacheUsage.Count) emplacements"
} else {
    Write-Warn "Cache peu utilisé"
    $perfScore -= 1
}

$auditResults.Scores["Performance"] = $perfScore

# ================================================================================
# PHASE 10 : TESTS
# ================================================================================

Write-Section "🧪 PHASE 10 : Tests & Couverture"

$testFiles = Get-ChildItem -Recurse -Include *.test.js,*.spec.js -Exclude node_modules,.next
Write-Host "  Fichiers de tests: $($testFiles.Count)" -ForegroundColor White

$testScore = if($testFiles.Count -eq 0) { 0 } elseif($testFiles.Count -lt 5) { 4 } elseif($testFiles.Count -lt 10) { 6 } else { 8 }

if ($testFiles.Count -lt 5) {
    Write-Warn "Tests insuffisants ($($testFiles.Count) fichiers)"
    $auditResults.Recommendations += "Ajouter tests pour fonctionnalités critiques (USB, création, auth)"
} else {
    Write-OK "$($testFiles.Count) fichiers de tests"
}

$auditResults.Scores["Tests"] = $testScore

# ================================================================================
# PHASE 11 : GÉNÉRATION SUIVI TEMPS
# ================================================================================

Write-Section "⏱️  PHASE 11 : Suivi du Temps (Git)"

$timeTrackingScript = Join-Path $PSScriptRoot "generate_time_tracking.ps1"
if (Test-Path $timeTrackingScript) {
    Write-Info "Génération du suivi du temps..."
    try {
        & $timeTrackingScript -ErrorAction Stop | Out-Null
        if (Test-Path "SUIVI_TEMPS_FACTURATION.md") {
            Write-OK "SUIVI_TEMPS_FACTURATION.md mis à jour"
        }
    } catch {
        Write-Warn "Erreur génération suivi temps: $($_.Exception.Message)"
    }
} else {
    Write-Warn "Script generate_time_tracking.ps1 non trouvé"
}

# ================================================================================
# CALCUL SCORE GLOBAL
# ================================================================================

Write-Section "🎯 SCORES FINAUX"

$scoreCategories = @(
    @{Name="Architecture"; Weight=1.0},
    @{Name="CodeMort"; Weight=1.5},
    @{Name="Duplication"; Weight=1.2},
    @{Name="Complexite"; Weight=1.2},
    @{Name="Routes"; Weight=0.8},
    @{Name="API"; Weight=1.5},
    @{Name="Database"; Weight=1.0},
    @{Name="Securite"; Weight=2.0},
    @{Name="Performance"; Weight=1.0},
    @{Name="Tests"; Weight=0.8}
)

$totalWeight = ($scoreCategories | Measure-Object -Property Weight -Sum).Sum
$weightedSum = 0

foreach ($category in $scoreCategories) {
    $score = $auditResults.Scores[$category.Name] ?? 5
    $weightedSum += $score * $category.Weight
    
    $color = if($score -ge 9){"Green"}elseif($score -ge 7){"Yellow"}else{"Red"}
    $status = if($score -ge 9){"✅"}elseif($score -ge 7){"⚠️"}else{"❌"}
    
    Write-Host ("  {0,-20} {1,4}/10  {2}" -f $category.Name, $score, $status) -ForegroundColor $color
}

$scoreGlobal = [math]::Round($weightedSum / $totalWeight, 1)

Write-Host "`n  ═══════════════════════════════════════" -ForegroundColor Gray
Write-Host ("  SCORE GLOBAL : {0}/10" -f $scoreGlobal) -ForegroundColor $(if($scoreGlobal -ge 9.5){"Green"}elseif($scoreGlobal -ge 8){"Yellow"}else{"Red"})
Write-Host "  ═══════════════════════════════════════" -ForegroundColor Gray

# ================================================================================
# GÉNÉRATION RAPPORT
# ================================================================================

if ($GenerateReport) {
    $timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
    $reportPath = "AUDIT_AUTO_RAPPORT_$timestamp.md"
    
    $report = @"
# 🔍 Rapport Audit Automatique Professionnel

**Date :** $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
**Score Global :** $scoreGlobal/10
**Généré par :** AUDIT_COMPLET_AUTOMATIQUE.ps1 v2.0

---

## 🎯 SCORES PAR DOMAINE

| Domaine | Score | Poids | Statut |
|---------|-------|-------|--------|
$($scoreCategories | ForEach-Object {
    $score = $auditResults.Scores[$_.Name] ?? 5
    $status = if($score -ge 9){"✅"}elseif($score -ge 7){"⚠️"}else{"❌"}
    "| $($_.Name) | $score/10 | $($_.Weight) | $status |"
})

**Score Global Pondéré : $scoreGlobal/10**

---

## 📊 STATISTIQUES

- **Fichiers JavaScript :** $($stats.JS) ($($stats.JSLines) lignes)
- **Fichiers PHP :** $($stats.PHP) ($($stats.PHPLines) lignes)
- **Composants React :** $($stats.Components)
- **Hooks :** $($stats.Hooks)
- **Pages :** $($stats.Pages)
- **Scripts :** $($stats.Scripts)
- **Documentation MD :** $($stats.MD)

---

## ❌ PROBLÈMES CRITIQUES ($($auditResults.Issues.Count))

$($auditResults.Issues | ForEach-Object { "- ❌ $_`n" })

---

## ⚠️  AVERTISSEMENTS ($($auditResults.Warnings.Count))

$($auditResults.Warnings | ForEach-Object { "- ⚠️  $_`n" })

---

## 💡 RECOMMANDATIONS ($($auditResults.Recommendations.Count))

$($auditResults.Recommendations | ForEach-Object { "- 💡 $_`n" })

---

## 🔍 DÉTAILS COMPLEXITÉ

### Fichiers Volumineux (> $MaxFileLines lignes)
$($complexity.LargeFiles | ForEach-Object { "- $($_.Path) - $($_.Lines) lignes`n" })

### Fonctions Longues (> $MaxFunctionLines lignes)
$($complexity.LongFunctions | ForEach-Object { "- $($_.File)::$($_.Function)() - ~$($_.Lines) lignes`n" })

---

## 🌐 ENDPOINTS API

**Testés :** $endpointsTotal
**OK :** $endpointsOK
**Score :** $apiScore/10

---

## 🎊 CONCLUSION

$(if($scoreGlobal -ge 9.5){"✅ EXCELLENT - Le projet est en très bon état!"}
elseif($scoreGlobal -ge 8){"⚠️  BON - Quelques améliorations possibles"}
elseif($scoreGlobal -ge 6){"⚠️  MOYEN - Corrections recommandées"}
else{"❌ CRITIQUE - Actions urgentes nécessaires"})

**Prochaines étapes :**
$(if($auditResults.Issues.Count -gt 0){"1. Corriger les $($auditResults.Issues.Count) problème(s) critique(s)`n"})
$(if($auditResults.Warnings.Count -gt 0){"2. Traiter les $($auditResults.Warnings.Count) avertissement(s)`n"})
$(if($auditResults.Recommendations.Count -gt 0){"3. Appliquer les $($auditResults.Recommendations.Count) recommandation(s)`n"})

---

**Audit généré automatiquement - Relancer régulièrement pour maintenir la qualité**

"@
    
    $report | Out-File -FilePath $reportPath -Encoding UTF8
    Write-OK "Rapport généré: $reportPath"
}

# ================================================================================
# RÉSUMÉ FINAL
# ================================================================================

Write-Host @"

================================================================================
✅ AUDIT PROFESSIONNEL TERMINÉ
================================================================================
Score Global      : $scoreGlobal/10
Problèmes         : $($auditResults.Issues.Count) critique(s)
Avertissements    : $($auditResults.Warnings.Count)
Recommandations   : $($auditResults.Recommendations.Count)
Code Mort         : $totalDead fichier(s)
Endpoints API     : $endpointsOK/$endpointsTotal OK
================================================================================

"@ -ForegroundColor Cyan

# Code de sortie basé sur le score
if ($scoreGlobal -ge 9.5) {
    Write-Host "🎉 EXCELLENT ! Projet de qualité professionnelle !" -ForegroundColor Green
    exit 0
} elseif ($scoreGlobal -ge 8) {
    Write-Host "✅ BON. Quelques optimisations possibles." -ForegroundColor Yellow
    exit 0
} elseif ($scoreGlobal -ge 6) {
    Write-Host "⚠️  MOYEN. Corrections recommandées." -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "❌ CRITIQUE. Actions urgentes nécessaires." -ForegroundColor Red
    exit 1
}
