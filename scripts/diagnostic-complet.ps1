# Script de diagnostic complet pour OTT Dashboard
# Usage: .\scripts\diagnostic-complet.ps1

Write-Host "🔍 DIAGNOSTIC COMPLET - OTT Dashboard" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# 1. Vérification des fichiers critiques
Write-Host "📁 1. Fichiers critiques:" -ForegroundColor Yellow
$criticalFiles = @(
    "package.json",
    "next.config.js",
    "app/layout.js",
    "app/page.js",
    "app/dashboard/page.js",
    "app/dashboard/layout.js",
    "contexts/AuthContext.js",
    "lib/api.js",
    "lib/config.js"
)

$missingFiles = @()
foreach ($file in $criticalFiles) {
    if (Test-Path $file) {
        Write-Host "  ✓ $file" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $file MANQUANT" -ForegroundColor Red
        $missingFiles += $file
    }
}

if ($missingFiles.Count -gt 0) {
    Write-Host ""
    Write-Host "  ❌ $($missingFiles.Count) fichier(s) manquant(s)!" -ForegroundColor Red
    exit 1
}

Write-Host ""

# 2. Vérification des dépendances
Write-Host "📦 2. Dépendances Node.js:" -ForegroundColor Yellow
if (Test-Path "node_modules") {
    $nodeModulesCount = (Get-ChildItem -Path "node_modules" -Directory | Measure-Object).Count
    Write-Host "  ✓ node_modules présent ($nodeModulesCount packages)" -ForegroundColor Green
} else {
    Write-Host "  ✗ node_modules manquant - Exécutez: npm install" -ForegroundColor Red
    exit 1
}

Write-Host ""

# 3. Vérification de la configuration
Write-Host "⚙️  3. Configuration:" -ForegroundColor Yellow

# Vérifier .env.local
if (Test-Path ".env.local") {
    Write-Host "  ✓ .env.local présent" -ForegroundColor Green
    $envContent = Get-Content ".env.local" -Raw
    if ($envContent -match "NEXT_PUBLIC_API_URL") {
        $apiUrl = ($envContent | Select-String -Pattern "NEXT_PUBLIC_API_URL=(.+)").Matches[0].Groups[1].Value.Trim()
        Write-Host "    API URL: $apiUrl" -ForegroundColor Gray
    } else {
        Write-Host "    ⚠️  NEXT_PUBLIC_API_URL non défini" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ⚠️  .env.local non trouvé (optionnel)" -ForegroundColor Yellow
}

# Vérifier next.config.js
if (Test-Path "next.config.js") {
    Write-Host "  ✓ next.config.js présent" -ForegroundColor Green
} else {
    Write-Host "  ✗ next.config.js MANQUANT" -ForegroundColor Red
    exit 1
}

Write-Host ""

# 4. Vérification des builds
Write-Host "🔨 4. État des builds:" -ForegroundColor Yellow

if (Test-Path ".next") {
    Write-Host "  ✓ Build de développement (.next) présent" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  Build de développement absent (normal si pas lancé)" -ForegroundColor Yellow
}

if (Test-Path "out") {
    $outFiles = (Get-ChildItem -Path "out" -Recurse -File | Measure-Object).Count
    Write-Host "  ✓ Build statique (out) présent ($outFiles fichiers)" -ForegroundColor Green
    
    # Vérifier les fichiers critiques dans out
    $outCritical = @("out/index.html", "out/sw.js", "out/manifest.json")
    foreach ($file in $outCritical) {
        if (Test-Path $file) {
            Write-Host "    ✓ $(Split-Path $file -Leaf)" -ForegroundColor Green
        } else {
            Write-Host "    ✗ $(Split-Path $file -Leaf) MANQUANT" -ForegroundColor Red
        }
    }
} else {
    Write-Host "  ⚠️  Build statique absent (normal si pas exporté)" -ForegroundColor Yellow
}

Write-Host ""

# 5. Test de compilation
Write-Host "🧪 5. Test de compilation:" -ForegroundColor Yellow
Write-Host "  Test en cours..." -ForegroundColor Gray

# Sauvegarder les variables d'environnement actuelles
$oldNodeEnv = $env:NODE_ENV
$oldStaticExport = $env:NEXT_STATIC_EXPORT
$oldBasePath = $env:NEXT_PUBLIC_BASE_PATH

# Configurer pour le test
$env:NODE_ENV = "development"
$env:NEXT_STATIC_EXPORT = $null
$env:NEXT_PUBLIC_BASE_PATH = $null

try {
    # Test de syntaxe seulement (pas de build complet)
    $testResult = npm run lint 2>&1 | Select-String -Pattern "error|Error|ERROR" -Quiet
    if ($testResult) {
        Write-Host "  ⚠️  Erreurs de lint détectées (voir ci-dessus)" -ForegroundColor Yellow
    } else {
        Write-Host "  ✓ Pas d'erreurs de syntaxe détectées" -ForegroundColor Green
    }
} catch {
    Write-Host "  ⚠️  Impossible de tester la compilation" -ForegroundColor Yellow
}

# Restaurer les variables
$env:NODE_ENV = $oldNodeEnv
$env:NEXT_STATIC_EXPORT = $oldStaticExport
$env:NEXT_PUBLIC_BASE_PATH = $oldBasePath

Write-Host ""

# 6. Vérification des ports
Write-Host "🌐 6. Vérification des ports:" -ForegroundColor Yellow
$port3000 = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($port3000) {
    Write-Host "  ⚠️  Port 3000 déjà utilisé" -ForegroundColor Yellow
    Write-Host "    Processus: $($port3000.OwningProcess)" -ForegroundColor Gray
} else {
    Write-Host "  ✓ Port 3000 disponible" -ForegroundColor Green
}

Write-Host ""

# 7. Résumé et recommandations
Write-Host "📊 RÉSUMÉ:" -ForegroundColor Cyan
Write-Host "==========" -ForegroundColor Cyan
Write-Host ""

$issues = 0
if ($missingFiles.Count -gt 0) { $issues++ }
if (-not (Test-Path "node_modules")) { $issues++ }

if ($issues -eq 0) {
    Write-Host "✅ Tous les fichiers critiques sont présents" -ForegroundColor Green
    Write-Host ""
    Write-Host "🚀 ACTIONS RECOMMANDÉES:" -ForegroundColor Yellow
    Write-Host "  1. Pour le développement local:" -ForegroundColor White
    Write-Host "     npm run dev" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  2. Pour tester le build statique:" -ForegroundColor White
    Write-Host "     npm run export" -ForegroundColor Cyan
    Write-Host "     npx serve out -p 3001" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  3. Pour déployer sur GitHub Pages:" -ForegroundColor White
    Write-Host "     npm run export" -ForegroundColor Cyan
    Write-Host "     git add out/ && git commit -m 'Deploy' && git push" -ForegroundColor Cyan
} else {
    Write-Host "❌ $issues problème(s) détecté(s)" -ForegroundColor Red
    Write-Host ""
    Write-Host "🔧 ACTIONS REQUISES:" -ForegroundColor Yellow
    if (-not (Test-Path "node_modules")) {
        Write-Host "  - Exécutez: npm install" -ForegroundColor Red
    }
    if ($missingFiles.Count -gt 0) {
        Write-Host "  - Vérifiez les fichiers manquants ci-dessus" -ForegroundColor Red
    }
}

Write-Host ""

