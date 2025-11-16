# Verification et correction du deploiement GitHub Pages

Write-Host "Verification du deploiement GitHub Pages..." -ForegroundColor Cyan
Write-Host ""

# 1. Verifier que out/index.html existe
if (Test-Path "out/index.html") {
    Write-Host "OK: out/index.html existe" -ForegroundColor Green
    $indexContent = Get-Content "out/index.html" -Raw
    
    if ($indexContent -match "OTT Dashboard") {
        Write-Host "  OK: Contenu correct - application Next.js trouvee" -ForegroundColor Green
    } else {
        Write-Host "  ERREUR: Contenu inattendu" -ForegroundColor Red
    }
} else {
    Write-Host "ERREUR: out/index.html n'existe pas!" -ForegroundColor Red
    Write-Host "  Executez d'abord: npm run export" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# 2. Verifier .nojekyll
if (Test-Path "out/.nojekyll") {
    Write-Host "OK: out/.nojekyll existe (Jekyll desactive)" -ForegroundColor Green
} else {
    Write-Host "ATTENTION: out/.nojekyll n'existe pas" -ForegroundColor Yellow
    New-Item -Path "out/.nojekyll" -ItemType File -Force | Out-Null
    Write-Host "  OK: Fichier cree" -ForegroundColor Green
}

Write-Host ""

# 3. Instructions
Write-Host "Instructions pour corriger GitHub Pages:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Allez sur GitHub: https://github.com/ymora/OTT/settings/pages" -ForegroundColor White
Write-Host ""
Write-Host "2. Dans la section Source, verifiez que:" -ForegroundColor White
Write-Host "   - Deploy from a branch est DESACTIVE" -ForegroundColor Green
Write-Host "   - GitHub Actions est SELECTIONNE" -ForegroundColor Green
Write-Host ""
Write-Host "3. Si Deploy from a branch est active, changez pour GitHub Actions" -ForegroundColor Yellow
Write-Host ""
Write-Host "4. Verifiez le workflow: https://github.com/ymora/OTT/actions" -ForegroundColor White
Write-Host "   Le dernier workflow doit etre vert (succes)" -ForegroundColor Gray
Write-Host ""
Write-Host "5. Apres le deploiement, videz le cache du navigateur" -ForegroundColor White
Write-Host "   Ctrl+Shift+R ou navigation privee" -ForegroundColor Gray
Write-Host ""
Write-Host "6. URL correcte: https://ymora.github.io/OTT/" -ForegroundColor Cyan
Write-Host ""
