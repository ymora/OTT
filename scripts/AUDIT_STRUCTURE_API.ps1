# ═══════════════════════════════════════════════════════════════════════════════
# 🏗️ AUDIT STRUCTURE API - OTT Dashboard
# ═══════════════════════════════════════════════════════════════════════════════
# Vérifie la cohérence des routes, handlers, et organisation des fonctions
# ═══════════════════════════════════════════════════════════════════════════════

$ErrorActionPreference = "Continue"

Write-Host "`n═══════════════════════════════════════════════════════════════════════════════" -ForegroundColor White
Write-Host "                    🏗️ AUDIT STRUCTURE API - OTT" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════════════════════" -ForegroundColor White
Write-Host ""

$issues = @()
$warnings = @()
$ok = @()

# ═══════════════════════════════════════════════════════════════════════════════
# 1. VÉRIFIER LES ROUTES DANS api.php
# ═══════════════════════════════════════════════════════════════════════════════

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "📋 ROUTES dans api.php" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

if (Test-Path "api.php") {
    $apiContent = Get-Content "api.php" -Raw
    
    # Extraire toutes les routes
    $routePattern = "elseif\(preg_match\('#([^']+)'#.*\) && \`$method === '([^']+)'\) \{[^\}]*handle(\w+)\("
    $routes = [regex]::Matches($apiContent, $routePattern)
    
    $routesByEndpoint = @{}
    $handlersCalled = @{}
    
    foreach ($route in $routes) {
        $path = $route.Groups[1].Value
        $method = $route.Groups[2].Value
        $handler = "handle" + $route.Groups[3].Value
        $key = "$method $path"
        
        if (-not $routesByEndpoint.ContainsKey($path)) {
            $routesByEndpoint[$path] = @{}
        }
        $routesByEndpoint[$path][$method] = $handler
        $handlersCalled[$handler] = $true
    }
    
    Write-Host "`n📊 ROUTES TROUVÉES: $($routes.Count)" -ForegroundColor Yellow
    Write-Host ""
    
    # Afficher par endpoint
    $routesByEndpoint.Keys | Sort-Object | ForEach-Object {
        $endpoint = $_
        $methods = $routesByEndpoint[$endpoint]
        
        Write-Host "  📍 $endpoint" -ForegroundColor White
        $methods.Keys | Sort-Object | ForEach-Object {
            $method = $_
            $handler = $methods[$method]
            $color = switch ($method) {
                "GET" { "Cyan" }
                "POST" { "Green" }
                "PUT" { "Yellow" }
                "PATCH" { "Magenta" }
                "DELETE" { "Red" }
                default { "Gray" }
            }
            Write-Host "     $method" -ForegroundColor $color -NoNewline
            Write-Host " → $handler" -ForegroundColor DarkGray
        }
    }
    
    $ok += "✓ $($routes.Count) routes analysées dans api.php"
} else {
    $issues += "❌ api.php introuvable !"
}

# ═══════════════════════════════════════════════════════════════════════════════
# 2. VÉRIFIER LES HANDLERS DÉFINIS
# ═══════════════════════════════════════════════════════════════════════════════

Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "🔧 HANDLERS DÉFINIS dans les fichiers" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

$handlerFiles = @(
    @{ 
        Path = "api/handlers/auth.php"
        Expected = @("User", "Login", "Register", "Role", "Permission", "Auth")
    }
    @{ 
        Path = "api/handlers/devices.php"
        Expected = @("Device", "Patient", "Measurement", "Alert", "Command", "Config", "Report")
    }
)

$handlersDefined = @{}

foreach ($file in $handlerFiles) {
    if (Test-Path $file.Path) {
        Write-Host "`n📄 $($file.Path):" -ForegroundColor Yellow
        $content = Get-Content $file.Path -Raw
        
        # Trouver toutes les fonctions handle*
        $functions = [regex]::Matches($content, "function (handle\w+)\(")
        
        foreach ($func in $functions) {
            $funcName = $func.Groups[1].Value
            $handlersDefined[$funcName] = $file.Path
            
            # Vérifier si bien placé
            $wellPlaced = $false
            foreach ($expected in $file.Expected) {
                if ($funcName -like "*$expected*") {
                    $wellPlaced = $true
                    break
                }
            }
            
            if ($wellPlaced) {
                Write-Host "  ✓ $funcName" -ForegroundColor Green
            } else {
                Write-Host "  ⚠️  $funcName" -ForegroundColor Yellow -NoNewline
                Write-Host " (contexte attendu: $($file.Expected -join ', '))" -ForegroundColor DarkYellow
                $warnings += "⚠️ $funcName dans $($file.Path) - peut-être mal placé"
            }
        }
        
        $ok += "✓ $($functions.Count) handlers dans $($file.Path)"
    } else {
        $issues += "❌ $($file.Path) introuvable !"
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
# 3. VÉRIFIER COHÉRENCE (appelés vs définis)
# ═══════════════════════════════════════════════════════════════════════════════

Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "🔍 COHÉRENCE (routes → handlers)" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

$handlersCalled.Keys | Sort-Object | ForEach-Object {
    $handler = $_
    
    if ($handlersDefined.ContainsKey($handler)) {
        $location = $handlersDefined[$handler] -replace [regex]::Escape($PWD.Path + "\"), ""
        Write-Host "  ✓ $handler" -ForegroundColor Green -NoNewline
        Write-Host " → $location" -ForegroundColor DarkGray
    } else {
        Write-Host "  ❌ $handler" -ForegroundColor Red -NoNewline
        Write-Host " → INTROUVABLE !" -ForegroundColor Red
        $issues += "❌ $handler appelé dans api.php mais NON DÉFINI"
    }
}

# Handlers définis mais jamais appelés ?
Write-Host "`n🔍 Handlers définis mais jamais appelés:" -ForegroundColor Yellow
$unusedHandlers = $handlersDefined.Keys | Where-Object { -not $handlersCalled.ContainsKey($_) }
if ($unusedHandlers.Count -gt 0) {
    $unusedHandlers | ForEach-Object {
        Write-Host "  ⚠️  $_" -ForegroundColor Yellow -NoNewline
        Write-Host " (dans $($handlersDefined[$_]))" -ForegroundColor DarkYellow
        $warnings += "⚠️ $_ défini mais jamais appelé"
    }
} else {
    Write-Host "  ✓ Tous les handlers sont utilisés" -ForegroundColor Green
    $ok += "✓ Aucun handler inutilisé"
}

# ═══════════════════════════════════════════════════════════════════════════════
# 4. VÉRIFIER ENDPOINTS SPÉCIFIQUES (restauration)
# ═══════════════════════════════════════════════════════════════════════════════

Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "🔧 ENDPOINTS CRITIQUES (restauration)" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

$criticalEndpoints = @(
    @{ Endpoint = "/patients/(\d+)"; Method = "PATCH"; Handler = "handleRestorePatient"; Purpose = "Restaurer patient" }
    @{ Endpoint = "/users/(\d+)"; Method = "PATCH"; Handler = "handleRestoreUser"; Purpose = "Restaurer utilisateur" }
)

foreach ($ep in $criticalEndpoints) {
    $found = $false
    foreach ($path in $routesByEndpoint.Keys) {
        if ($path -match $ep.Endpoint -and $routesByEndpoint[$path].ContainsKey($ep.Method)) {
            $handler = $routesByEndpoint[$path][$ep.Method]
            if ($handler -eq $ep.Handler) {
                Write-Host "  ✓ $($ep.Purpose)" -ForegroundColor Green -NoNewline
                Write-Host " → $($ep.Method) $path → $handler" -ForegroundColor DarkGray
                $found = $true
                break
            }
        }
    }
    
    if (-not $found) {
        Write-Host "  ❌ $($ep.Purpose)" -ForegroundColor Red -NoNewline
        Write-Host " → $($ep.Method) $($ep.Endpoint) → $($ep.Handler) MANQUANT !" -ForegroundColor Red
        $issues += "❌ Endpoint manquant: $($ep.Method) $($ep.Endpoint) → $($ep.Handler)"
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
# RÉSUMÉ FINAL
# ═══════════════════════════════════════════════════════════════════════════════

Write-Host "`n═══════════════════════════════════════════════════════════════════════════════" -ForegroundColor White
Write-Host "📊 RÉSUMÉ" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════════════════════" -ForegroundColor White

if ($ok.Count -gt 0) {
    Write-Host "`n✅ OK ($($ok.Count)):" -ForegroundColor Green
    $ok | ForEach-Object { Write-Host "  $_" -ForegroundColor Green }
}

if ($warnings.Count -gt 0) {
    Write-Host "`n⚠️  AVERTISSEMENTS ($($warnings.Count)):" -ForegroundColor Yellow
    $warnings | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
}

if ($issues.Count -gt 0) {
    Write-Host "`n❌ PROBLÈMES CRITIQUES ($($issues.Count)):" -ForegroundColor Red
    $issues | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    Write-Host "`n❌ STRUCTURE API INCOHÉRENTE !" -ForegroundColor Red
    exit 1
} else {
    Write-Host "`n🎉 ✅ STRUCTURE API COHÉRENTE !" -ForegroundColor Green
    exit 0
}

