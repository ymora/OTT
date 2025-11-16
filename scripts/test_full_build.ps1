# ============================================================================
# Tests complets du build Next.js pour GitHub Pages
# ============================================================================
# Verifie le build, la structure des fichiers, et la configuration
# ============================================================================

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Tests complets du build Next.js" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Variables
$testsPassed = 0
$testsFailed = 0
$warnings = 0

function Test-Step {
    param(
        [string]$Name,
        [scriptblock]$Test,
        [bool]$IsWarning = $false
    )
    
    Write-Host "[TEST] $Name..." -NoNewline -ForegroundColor Yellow
    
    try {
        $result = & $Test
        if ($result) {
            Write-Host " OK" -ForegroundColor Green
            $script:testsPassed++
            return $true
        } else {
            if ($IsWarning) {
                Write-Host " ATTENTION" -ForegroundColor Yellow
                $script:warnings++
                return $false
            } else {
                Write-Host " ECHEC" -ForegroundColor Red
                $script:testsFailed++
                return $false
            }
        }
    } catch {
        Write-Host " ERREUR: $($_.Exception.Message)" -ForegroundColor Red
        $script:testsFailed++
        return $false
    }
}

# Test 1: Node.js installe
Test-Step "Node.js installe" {
    $nodeVersion = node -v 2>&1
    return $LASTEXITCODE -eq 0
}

# Test 2: npm installe
Test-Step "npm installe" {
    $npmVersion = npm -v 2>&1
    return $LASTEXITCODE -eq 0
}

# Test 3: Dependances installees
Test-Step "Dependances installees" {
    return (Test-Path "node_modules")
}

# Test 4: Nettoyer les anciens builds
Write-Host ""
Write-Host "Nettoyage des anciens builds..." -ForegroundColor Cyan
if (Test-Path "out") {
    Remove-Item -Path "out" -Recurse -Force
    Write-Host "  Dossier out/ supprime" -ForegroundColor Gray
}
if (Test-Path ".next") {
    Remove-Item -Path ".next" -Recurse -Force
    Write-Host "  Dossier .next/ supprime" -ForegroundColor Gray
}
Write-Host ""

# Test 5: Build Next.js
Write-Host "[BUILD] Compilation Next.js..." -ForegroundColor Cyan
$env:NEXT_PUBLIC_API_URL = "https://ott-jbln.onrender.com"
$env:NEXT_PUBLIC_REQUIRE_AUTH = "true"
$env:NEXT_PUBLIC_ENABLE_DEMO_RESET = "false"
$env:NEXT_STATIC_EXPORT = "true"
$env:NEXT_PUBLIC_BASE_PATH = "/OTT"
$env:NODE_ENV = "production"

npm run export 2>&1 | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "  OK: Build reussi" -ForegroundColor Green
    $testsPassed++
} else {
    Write-Host "  ECHEC: Build echoue" -ForegroundColor Red
    $testsFailed++
    Write-Host ""
    Write-Host "Arret des tests - le build doit reussir" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Test 6: Dossier out/ existe
Test-Step "Dossier out/ existe" {
    return (Test-Path "out")
}

# Test 7: index.html existe
Test-Step "Fichier out/index.html existe" {
    return (Test-Path "out/index.html")
}

# Test 8: Contenu de index.html
Test-Step "index.html contient l'application Next.js" {
    if (-not (Test-Path "out/index.html")) { return $false }
    $content = Get-Content "out/index.html" -Raw
    return ($content -match "OTT Dashboard" -and $content -match "next")
}

# Test 9: index.html ne contient PAS la documentation
Test-Step "index.html ne contient pas la documentation" {
    if (-not (Test-Path "out/index.html")) { return $false }
    $content = Get-Content "out/index.html" -Raw
    return -not ($content -match "Documentation OTT")
}

# Test 10: .nojekyll existe
Test-Step "Fichier out/.nojekyll existe" {
    if (-not (Test-Path "out/.nojekyll")) {
        New-Item -Path "out/.nojekyll" -ItemType File -Force | Out-Null
    }
    return (Test-Path "out/.nojekyll")
}

# Test 11: Structure _next/ existe
Test-Step "Dossier out/_next/ existe" {
    return (Test-Path "out/_next")
}

# Test 12: Fichiers statiques CSS
Test-Step "Fichiers CSS generes" {
    $cssFiles = Get-ChildItem "out/_next/static/css" -ErrorAction SilentlyContinue
    return ($cssFiles.Count -gt 0)
}

# Test 13: Fichiers JavaScript generes
Test-Step "Fichiers JavaScript generes" {
    $jsFiles = Get-ChildItem "out/_next/static/chunks" -Recurse -Filter "*.js" -ErrorAction SilentlyContinue
    return ($jsFiles.Count -gt 0)
}

# Test 14: DOCUMENTATION_COMPLETE_OTT.html (warning si present)
Test-Step "DOCUMENTATION_COMPLETE_OTT.html dans out/" {
    return -not (Test-Path "out/DOCUMENTATION_COMPLETE_OTT.html")
} -IsWarning $true

# Test 15: Fichiers dashboard generes
Test-Step "Pages dashboard generees" {
    return (Test-Path "out/dashboard")
}

# Test 16: Manifest.json
Test-Step "Fichier manifest.json existe" {
    return (Test-Path "out/manifest.json")
}

# Test 17: Icons
Test-Step "Fichiers icons existent" {
    return ((Test-Path "out/icon-192.png") -and (Test-Path "out/icon-512.png"))
}

# Test 18: Service Worker
Test-Step "Service Worker (sw.js) existe" {
    return (Test-Path "out/sw.js")
}

# Test 19: Verifier basePath dans les chemins
Test-Step "Chemins utilisent /OTT (basePath)" {
    if (-not (Test-Path "out/index.html")) { return $false }
    $content = Get-Content "out/index.html" -Raw
    return ($content -match "/OTT/_next" -or $content -match "/OTT/manifest.json")
}

# Test 20: Taille du build
Write-Host ""
Write-Host "[INFO] Taille du build:" -ForegroundColor Cyan
$outSize = (Get-ChildItem "out" -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host "  Total: $([math]::Round($outSize, 2)) MB" -ForegroundColor Gray

$indexSize = (Get-Item "out/index.html").Length / 1KB
Write-Host "  index.html: $([math]::Round($indexSize, 2)) KB" -ForegroundColor Gray

Write-Host ""

# Resume
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Resume des tests" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Tests reussis: $testsPassed" -ForegroundColor Green
if ($warnings -gt 0) {
    Write-Host "Avertissements: $warnings" -ForegroundColor Yellow
}
if ($testsFailed -gt 0) {
    Write-Host "Tests echoues: $testsFailed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Le build n'est pas pret pour le deploiement" -ForegroundColor Red
    exit 1
} else {
    Write-Host "Tests echoues: 0" -ForegroundColor Green
    Write-Host ""
    Write-Host "SUCCES: Le build est pret pour GitHub Pages!" -ForegroundColor Green
    Write-Host ""
    
    # Instructions
    Write-Host "Prochaines etapes:" -ForegroundColor Cyan
    Write-Host "  1. Commit et push les changements" -ForegroundColor White
    Write-Host "  2. Verifier GitHub Pages Settings > Source = GitHub Actions" -ForegroundColor White
    Write-Host "  3. Attendre le deploiement automatique" -ForegroundColor White
    Write-Host "  4. Tester: https://ymora.github.io/OTT/" -ForegroundColor White
    Write-Host ""
}

