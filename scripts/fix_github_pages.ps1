# ============================================================================
# Script pour corriger le deploiement GitHub Pages
# ============================================================================
# Supprime le dossier docs/ obsolete et verifie la configuration
# ============================================================================

Write-Host "Correction du deploiement GitHub Pages..." -ForegroundColor Cyan
Write-Host ""

# Verifier si docs/ existe
if (Test-Path "docs") {
    Write-Host "Dossier docs/ trouve (ancienne exportation)" -ForegroundColor Yellow
    $confirm = Read-Host "Supprimer le dossier docs/ ? [O/n]"
    if ($confirm -eq "O" -or $confirm -eq "o" -or $confirm -eq "") {
        Remove-Item -Path "docs" -Recurse -Force
        Write-Host "Dossier docs/ supprime" -ForegroundColor Green
    } else {
        Write-Host "Dossier docs/ conserve (peut causer des conflits)" -ForegroundColor Yellow
    }
} else {
    Write-Host "Dossier docs/ n'existe pas (OK)" -ForegroundColor Green
}

Write-Host ""

# Verifier .gitignore
Write-Host "Verification de .gitignore..." -ForegroundColor Cyan
$gitignore = Get-Content ".gitignore" -ErrorAction SilentlyContinue
if ($null -eq $gitignore) {
    $gitignore = @()
}

$needsUpdate = $false

if ($gitignore -notcontains "docs/") {
    Add-Content -Path ".gitignore" -Value "`ndocs/"
    Write-Host "  Ajoute docs/ a .gitignore" -ForegroundColor Green
    $needsUpdate = $true
}

if ($gitignore -notcontains "out/") {
    Add-Content -Path ".gitignore" -Value "out/"
    Write-Host "  Ajoute out/ a .gitignore" -ForegroundColor Green
    $needsUpdate = $true
}

if (-not $needsUpdate) {
    Write-Host "  .gitignore est a jour" -ForegroundColor Green
}

Write-Host ""

# Creer .nojekyll dans out/ si le dossier existe
if (Test-Path "out") {
    $nojekyll = Join-Path "out" ".nojekyll"
    if (-not (Test-Path $nojekyll)) {
        New-Item -Path $nojekyll -ItemType File -Force | Out-Null
        Write-Host "Fichier out/.nojekyll cree" -ForegroundColor Green
    } else {
        Write-Host "Fichier out/.nojekyll existe deja" -ForegroundColor Green
    }
} else {
    Write-Host "Dossier out/ n'existe pas (sera cree lors du build)" -ForegroundColor Yellow
}

Write-Host ""

# Verifier le workflow
Write-Host "Verification du workflow GitHub Actions..." -ForegroundColor Cyan
$workflow = Get-Content ".github/workflows/deploy.yml" -ErrorAction SilentlyContinue
if ($workflow) {
    if ($workflow -match "path: \./out") {
        Write-Host "  Workflow configure correctement (deploie depuis ./out)" -ForegroundColor Green
    } else {
        Write-Host "  ATTENTION: Workflow ne semble pas deployer depuis ./out" -ForegroundColor Red
    }
} else {
    Write-Host "  ATTENTION: Fichier .github/workflows/deploy.yml non trouve" -ForegroundColor Red
}

Write-Host ""
Write-Host "Instructions importantes:" -ForegroundColor Yellow
Write-Host "  1. Dans GitHub: Settings > Pages > Source" -ForegroundColor White
Write-Host "     DOIT etre: 'GitHub Actions' (pas 'Deploy from a branch')" -ForegroundColor White
Write-Host ""
Write-Host "  2. Le workflow deploie depuis ./out (correct)" -ForegroundColor White
Write-Host ""
Write-Host "  3. Apres un push sur main, le workflow va:" -ForegroundColor White
Write-Host "     - Builder Next.js avec basePath=/OTT" -ForegroundColor Gray
Write-Host "     - Exporter dans ./out" -ForegroundColor Gray
Write-Host "     - Deployer ./out sur GitHub Pages" -ForegroundColor Gray
Write-Host ""
Write-Host "  4. L'URL sera: https://ymora.github.io/OTT/" -ForegroundColor White
Write-Host ""
Write-Host "  5. Si vous voyez encore la doc, videz le cache du navigateur" -ForegroundColor Yellow
Write-Host "     (Ctrl+Shift+R ou navigation privee)" -ForegroundColor Gray
Write-Host ""

