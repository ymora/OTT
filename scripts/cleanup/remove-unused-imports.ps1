# Script de nettoyage des imports inutilisés
# Utilise eslint --fix pour nettoyer automatiquement

param(
    [string]$Path = ".",
    [switch]$DryRun = $false
)

Write-Host "🧹 Nettoyage des imports inutilisés..." -ForegroundColor Cyan
Write-Host ""

if ($DryRun) {
    Write-Host "Mode DRY RUN - Aucune modification ne sera effectuée" -ForegroundColor Yellow
    Write-Host ""
}

# Vérifier que node_modules existe
if (-not (Test-Path "node_modules")) {
    Write-Host "❌ node_modules introuvable. Exécutez 'npm install' d'abord." -ForegroundColor Red
    exit 1
}

# Compter les fichiers JS/JSX
$jsFiles = Get-ChildItem -Path $Path -Recurse -Include "*.js","*.jsx" | 
    Where-Object { $_.FullName -notmatch "node_modules|\.next|\.git|out" }

$totalFiles = $jsFiles.Count
Write-Host "📁 Fichiers à analyser: $totalFiles" -ForegroundColor White
Write-Host ""

if ($DryRun) {
    # Mode dry-run: juste lister les problèmes
    Write-Host "🔍 Analyse (dry-run)..." -ForegroundColor Yellow
    $result = & npm run lint -- --format=json 2>&1 | Out-String
    
    try {
        # Extraire le JSON des résultats
        $jsonStart = $result.IndexOf('[')
        if ($jsonStart -ge 0) {
            $jsonEnd = $result.LastIndexOf(']')
            $jsonContent = $result.Substring($jsonStart, $jsonEnd - $jsonStart + 1)
            $lintResults = $jsonContent | ConvertFrom-Json
            
            $unusedCount = 0
            foreach ($file in $lintResults) {
                if ($file.messages) {
                    $unusedImports = $file.messages | Where-Object { 
                        $_.message -match "is defined but never used|imported but never used"
                    }
                    if ($unusedImports.Count -gt 0) {
                        $unusedCount += $unusedImports.Count
                        $relativePath = $file.filePath -replace [regex]::Escape($PWD), ""
                        Write-Host "  📄 $relativePath" -ForegroundColor Gray
                        foreach ($msg in $unusedImports) {
                            Write-Host "     ligne $($msg.line): $($msg.message)" -ForegroundColor Yellow
                        }
                    }
                }
            }
            
            Write-Host ""
            Write-Host "📊 Total imports inutilisés détectés: $unusedCount" -ForegroundColor White
        }
    } catch {
        Write-Host "⚠️ Impossible de parser les résultats ESLint" -ForegroundColor Yellow
    }
} else {
    # Mode fix: corriger automatiquement
    Write-Host "🔧 Correction automatique..." -ForegroundColor Green
    
    $fixedCount = 0
    foreach ($file in $jsFiles) {
        $relativePath = $file.FullName -replace [regex]::Escape($PWD), ""
        
        # Exécuter eslint --fix sur chaque fichier
        $result = & npx eslint --fix "$($file.FullName)" 2>&1
        
        if ($LASTEXITCODE -eq 0 -or $result -match "fixed") {
            Write-Host "  ✓ $relativePath" -ForegroundColor Green
            $fixedCount++
        }
    }
    
    Write-Host ""
    Write-Host "✅ Fichiers corrigés: $fixedCount/$totalFiles" -ForegroundColor Green
}

Write-Host ""
Write-Host "✨ Terminé!" -ForegroundColor Cyan

