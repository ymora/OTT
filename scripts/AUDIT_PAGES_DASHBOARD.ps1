# Script d'audit complet des pages du dashboard
# Vérifie : code mort, doublons, optimisations, API, logique

$ErrorActionPreference = "Stop"
$pages = @(
    @{ name = "Dashboard"; path = "app/dashboard/page.js" },
    @{ name = "Dispositifs"; path = "app/dashboard/dispositifs/page.js" },
    @{ name = "Patients"; path = "app/dashboard/patients/page.js" },
    @{ name = "Utilisateurs"; path = "app/dashboard/users/page.js" },
    @{ name = "Documentation"; path = "app/dashboard/documentation/page.js" }
)

Write-Host "`n🔍 AUDIT COMPLET DES PAGES DASHBOARD`n" -ForegroundColor Cyan

foreach ($page in $pages) {
    Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
    Write-Host "📄 PAGE: $($page.name)" -ForegroundColor Yellow
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
    
    if (-not (Test-Path $page.path)) {
        Write-Host "❌ Fichier introuvable: $($page.path)" -ForegroundColor Red
        continue
    }
    
    $content = Get-Content $page.path -Raw
    
    # 1. Vérifier les imports inutilisés
    Write-Host "`n1️⃣ IMPORTS:" -ForegroundColor Cyan
    $imports = [regex]::Matches($content, "import\s+.*?\s+from\s+['""](.*?)['""]", [System.Text.RegularExpressions.RegexOptions]::Singleline)
    $importedModules = @()
    foreach ($match in $imports) {
        $module = $match.Groups[1].Value
        $importedModules += $module
        # Vérifier si le module est utilisé
        $moduleName = Split-Path $module -Leaf
        $moduleName = $moduleName -replace '\.(js|jsx|ts|tsx)$', ''
        if ($moduleName -eq 'index') {
            $moduleName = Split-Path (Split-Path $module -Parent) -Leaf
        }
        $usageCount = ([regex]::Matches($content, "\b$moduleName\b")).Count
        if ($usageCount -le 1) {
            Write-Host "  ⚠️  Import possiblement inutilisé: $module" -ForegroundColor Yellow
        }
    }
    
    # 2. Vérifier les hooks et variables inutilisées
    Write-Host "`n2️⃣ HOOKS ET VARIABLES:" -ForegroundColor Cyan
    $hooks = [regex]::Matches($content, "(const|let|var)\s+(\w+)\s*=", [System.Text.RegularExpressions.RegexOptions]::Multiline)
    foreach ($hook in $hooks) {
        $varName = $hook.Groups[2].Value
        if ($varName -notmatch '^(use|set|is|has|can|should|will|did)$') {
            $usageCount = ([regex]::Matches($content, "\b$varName\b")).Count
            if ($usageCount -eq 1) {
                Write-Host "  ⚠️  Variable possiblement inutilisée: $varName" -ForegroundColor Yellow
            }
        }
    }
    
    # 3. Vérifier les appels API
    Write-Host "`n3️⃣ APPELS API:" -ForegroundColor Cyan
    $apiCalls = [regex]::Matches($content, "(useApiData|fetchJson|fetchWithAuth|fetch\(|axios\.)", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    $apiEndpoints = [regex]::Matches($content, "['""](/api\.php/[^'""]+)['""]", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    Write-Host "  📡 Appels API détectés: $($apiCalls.Count)" -ForegroundColor Green
    foreach ($endpoint in $apiEndpoints) {
        Write-Host "    - $($endpoint.Groups[1].Value)" -ForegroundColor Gray
    }
    
    # 4. Vérifier les doublons de code
    Write-Host "`n4️⃣ DOUBLONS POTENTIELS:" -ForegroundColor Cyan
    $functions = [regex]::Matches($content, "(const|function)\s+(\w+)\s*=", [System.Text.RegularExpressions.RegexOptions]::Multiline)
    $functionNames = @()
    foreach ($func in $functions) {
        $funcName = $func.Groups[2].Value
        if ($functionNames -contains $funcName) {
            Write-Host "  ⚠️  Fonction dupliquée: $funcName" -ForegroundColor Yellow
        } else {
            $functionNames += $funcName
        }
    }
    
    # 5. Vérifier les optimisations (useMemo, useCallback)
    Write-Host "`n5️⃣ OPTIMISATIONS:" -ForegroundColor Cyan
    $useMemoCount = ([regex]::Matches($content, "useMemo")).Count
    $useCallbackCount = ([regex]::Matches($content, "useCallback")).Count
    $filterCount = ([regex]::Matches($content, "\.filter\(")).Count
    $mapCount = ([regex]::Matches($content, "\.map\(")).Count
    $findCount = ([regex]::Matches($content, "\.find\(")).Count
    
    Write-Host "  ✅ useMemo: $useMemoCount" -ForegroundColor Green
    Write-Host "  ✅ useCallback: $useCallbackCount" -ForegroundColor Green
    Write-Host "  📊 .filter(): $filterCount" -ForegroundColor Gray
    Write-Host "  📊 .map(): $mapCount" -ForegroundColor Gray
    Write-Host "  📊 .find(): $findCount" -ForegroundColor Gray
    
    if ($filterCount -gt 5 -and $useMemoCount -lt $filterCount) {
        Write-Host "  ⚠️  Beaucoup de .filter() sans useMemo - optimisation possible" -ForegroundColor Yellow
    }
    
    # 6. Vérifier le code mort (TODO, FIXME, console.log)
    Write-Host "`n6️⃣ CODE MORT / COMMENTAIRES:" -ForegroundColor Cyan
    $todos = ([regex]::Matches($content, "(TODO|FIXME|XXX|HACK|BUG)", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)).Count
    $consoleLogs = ([regex]::Matches($content, "console\.(log|debug|warn|error)")).Count
    if ($todos -gt 0) {
        Write-Host "  ⚠️  TODO/FIXME détectés: $todos" -ForegroundColor Yellow
    }
    if ($consoleLogs -gt 0) {
        Write-Host "  ⚠️  console.log détectés: $consoleLogs (à retirer en production)" -ForegroundColor Yellow
    }
    
    # 7. Vérifier la logique (conditions complexes, nested loops)
    Write-Host "`n7️⃣ COMPLEXITÉ:" -ForegroundColor Cyan
    $ifCount = ([regex]::Matches($content, "\bif\s*\(")).Count
    $forCount = ([regex]::Matches($content, "\bfor\s*\(")).Count
    $whileCount = ([regex]::Matches($content, "\bwhile\s*\(")).Count
    Write-Host "  📊 if: $ifCount" -ForegroundColor Gray
    Write-Host "  📊 for: $forCount" -ForegroundColor Gray
    Write-Host "  📊 while: $whileCount" -ForegroundColor Gray
    
    # 8. Taille du fichier
    $lineCount = (Get-Content $page.path).Count
    Write-Host "`n8️⃣ TAILLE:" -ForegroundColor Cyan
    Write-Host "  📏 Lignes: $lineCount" -ForegroundColor Gray
    if ($lineCount -gt 500) {
        Write-Host "  ⚠️  Fichier volumineux (>500 lignes) - considérer la refactorisation" -ForegroundColor Yellow
    }
}

Write-Host "`n✅ AUDIT TERMINÉ`n" -ForegroundColor Green

