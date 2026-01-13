# Script pour analyser et corriger les problemes identifies par l'audit
# - Imports inutilises
# - Requetes SQL N+1
# - Requetes API non paginees
# - Timers sans cleanup

Write-Host "[ANALYSE] Analyse des problemes identifies par l'audit" -ForegroundColor Cyan

$issues = @{
    imports = @()
    sqlN1 = @()
    apiNoPagination = @()
    timersNoCleanup = @()
}

# 1. Analyser les imports inutilises
Write-Host "`n[1/4] Analyse des imports inutilises..." -ForegroundColor Yellow
$jsFiles = Get-ChildItem -Path . -Include *.js,*.jsx -Recurse -Exclude node_modules,*.test.js,*.spec.js | Where-Object { $_.FullName -notmatch "node_modules|\.next" }
$importCount = 0
foreach ($file in $jsFiles) {
    $content = Get-Content $file.FullName -Raw
    if ($content -match "import\s+.*from") {
        $importCount++
    }
}
Write-Host "   [INFO] $importCount fichiers JS avec imports detectes" -ForegroundColor Gray
Write-Host "   [INFO] Utiliser: npm run lint (ou npx eslint) pour identifier les imports inutilises" -ForegroundColor Gray

# 2. Analyser les requetes SQL N+1 (dans des boucles)
Write-Host "`n[2/4] Analyse des requetes SQL N+1..." -ForegroundColor Yellow
$phpFiles = Get-ChildItem -Path .\api -Include *.php -Recurse
$n1Pattern = @(
    'foreach\s*\([^)]+\)\s*\{[^}]*prepare\s*\([^)]*SELECT',
    'for\s*\([^)]+\)\s*\{[^}]*prepare\s*\([^)]*SELECT',
    'foreach\s*\([^)]+\)\s*\{[^}]*query\s*\([^)]*SELECT'
)
foreach ($file in $phpFiles) {
    $content = Get-Content $file.FullName -Raw
    foreach ($pattern in $n1Pattern) {
        if ($content -match $pattern) {
            $line = ($content -split "`n") | Select-String -Pattern $pattern | Select-Object -First 1
            $issues.sqlN1 += @{
                file = $file.FullName
                pattern = $pattern
                line = $line
            }
        }
    }
}
Write-Host "   [INFO] $($issues.sqlN1.Count) potentielles requetes N+1 detectees" -ForegroundColor $(if ($issues.sqlN1.Count -gt 0) { "Yellow" } else { "Green" })

# 3. Analyser les endpoints API sans pagination
Write-Host "`n[3/4] Analyse des endpoints API sans pagination..." -ForegroundColor Yellow
$apiHandlers = Get-ChildItem -Path .\api\handlers -Include *.php -Recurse
$noPaginationPattern = 'function\s+handleGet[^}]*SELECT[^}]*FROM[^}]*ORDER\s+BY[^}]*echo\s+json_encode'
foreach ($file in $apiHandlers) {
    $content = Get-Content $file.FullName -Raw
    # Chercher les fonctions handleGet qui retournent des listes
    if ($content -match 'function\s+handleGet[A-Za-z]*\(\)') {
        $functionContent = $content -split 'function\s+handleGet[A-Za-z]*\(\)' | Select-Object -Skip 1 -First 1
        if ($functionContent -match 'SELECT.*FROM' -and $functionContent -notmatch 'LIMIT\s*:?limit|LIMIT\s+\$limit') {
            # Verifier si c'est une liste (pas un single item)
            if ($functionContent -match 'ORDER\s+BY|GROUP\s+BY' -or $functionContent -match 'fetchAll\(\)') {
                $issues.apiNoPagination += @{
                    file = $file.FullName
                    function = ($content -split 'function\s+') | Where-Object { $_ -match '^handleGet' } | Select-Object -First 1 -split '\(' | Select-Object -First 1
                }
            }
        }
    }
}
Write-Host "   [INFO] $($issues.apiNoPagination.Count) endpoints potentiellement sans pagination detectes" -ForegroundColor $(if ($issues.apiNoPagination.Count -gt 0) { "Yellow" } else { "Green" })

# 4. Analyser les timers sans cleanup
Write-Host "`n[4/4] Analyse des timers sans cleanup..." -ForegroundColor Yellow
$jsFiles = Get-ChildItem -Path . -Include *.js,*.jsx -Recurse -Exclude node_modules,*.test.js,*.spec.js | Where-Object { $_.FullName -notmatch "node_modules|\.next" }
$timerPattern = 'setTimeout\s*\(|setInterval\s*\('
foreach ($file in $jsFiles) {
    $content = Get-Content $file.FullName -Raw
    $lines = $content -split "`n"
    for ($i = 0; $i -lt $lines.Length; $i++) {
        $line = $lines[$i]
        if ($line -match $timerPattern) {
            # Verifier si cleanup existe dans useEffect ou componentWillUnmount
            $nextLines = $lines[$i..([Math]::Min($i+50, $lines.Length-1))] -join "`n"
            if ($nextLines -notmatch 'clearTimeout|clearInterval|useTimeout|useInterval|return\s+\(\)\s*=>|useEffect.*return') {
                # Vérifier le contexte (peut être dans un useEffect avec cleanup ailleurs)
                $beforeLines = if ($i -gt 0) { $lines[[Math]::Max(0, $i-30)..$i] -join "`n" } else { "" }
                if ($beforeLines -notmatch 'useEffect|componentWillUnmount|useTimeout|useInterval') {
                    $issues.timersNoCleanup += @{
                        file = $file.FullName
                        line = $i + 1
                        code = $line.Trim()
                    }
                }
            }
        }
    }
}
Write-Host "   [INFO] $($issues.timersNoCleanup.Count) timers potentiellement sans cleanup detectes" -ForegroundColor $(if ($issues.timersNoCleanup.Count -gt 0) { "Yellow" } else { "Green" })

# Resume
Write-Host "`n[RESUME] Resume de l'analyse:" -ForegroundColor Cyan
Write-Host "   [INFO] Imports inutilises: $importCount fichiers JS avec imports (utiliser ESLint)" -ForegroundColor Gray
Write-Host "   [WARN] Requetes SQL N+1: $($issues.sqlN1.Count)" -ForegroundColor $(if ($issues.sqlN1.Count -gt 0) { "Yellow" } else { "Green" })
Write-Host "   [WARN] Endpoints API sans pagination: $($issues.apiNoPagination.Count)" -ForegroundColor $(if ($issues.apiNoPagination.Count -gt 0) { "Yellow" } else { "Green" })
Write-Host "   [WARN] Timers sans cleanup: $($issues.timersNoCleanup.Count)" -ForegroundColor $(if ($issues.timersNoCleanup.Count -gt 0) { "Yellow" } else { "Green" })

# Afficher les details si demandes
if ($issues.sqlN1.Count -gt 0) {
    Write-Host "`n[SQL N+1] Details:" -ForegroundColor Yellow
    foreach ($issue in $issues.sqlN1 | Select-Object -First 5) {
        Write-Host "   - $($issue.file)" -ForegroundColor Gray
    }
}

if ($issues.apiNoPagination.Count -gt 0) {
    Write-Host "`n[API SANS PAGINATION] Details:" -ForegroundColor Yellow
    foreach ($issue in $issues.apiNoPagination | Select-Object -First 10) {
        Write-Host "   - $($issue.file): $($issue.function)" -ForegroundColor Gray
    }
}

if ($issues.timersNoCleanup.Count -gt 0) {
    Write-Host "`n[TIMERS SANS CLEANUP] Details (premiers 10):" -ForegroundColor Yellow
    foreach ($issue in $issues.timersNoCleanup | Select-Object -First 10) {
        Write-Host "   - $($issue.file):L$($issue.line) - $($issue.code.Substring(0, [Math]::Min(60, $issue.code.Length)))" -ForegroundColor Gray
    }
}

Write-Host "`n[RECOMMANDATIONS]" -ForegroundColor Cyan
Write-Host "   1. Imports inutilises: Executer 'npm run lint' ou 'npx eslint . --ext .js,.jsx'" -ForegroundColor White
Write-Host "   2. SQL N+1: Analyser manuellement les fichiers listes ci-dessus" -ForegroundColor White
Write-Host "   3. API sans pagination: Ajouter LIMIT/OFFSET ou pagination aux endpoints listes" -ForegroundColor White
Write-Host "   4. Timers sans cleanup: Verifier et ajouter cleanup dans useEffect ou utiliser useTimeout/useInterval hooks" -ForegroundColor White

