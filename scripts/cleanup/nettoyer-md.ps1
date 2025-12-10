# Script pour nettoyer les fichiers MD inutiles
# Garde seulement : README.md, SUIVI_TEMPS_FACTURATION.md (public/), et README dans bin/, audit/, scripts/

Write-Host "🧹 Nettoyage des fichiers MD inutiles..." -ForegroundColor Cyan
Write-Host ""

$filesToKeep = @(
    "README.md",
    "public\SUIVI_TEMPS_FACTURATION.md",
    "SUIVI_TEMPS_FACTURATION.md",
    "bin\README.md",
    "scripts\README-check-measurements.md"
)

# Garder aussi tous les README.md dans audit/
$auditReadme = Get-ChildItem -Path "audit" -Filter "README.md" -Recurse -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName.Replace((Get-Location).Path + "\", "") }

$allFilesToKeep = $filesToKeep + $auditReadme

Write-Host "📋 Fichiers à conserver:" -ForegroundColor Green
$allFilesToKeep | ForEach-Object { Write-Host "  ✅ $_" -ForegroundColor Gray }

Write-Host ""
Write-Host "Fichiers a supprimer:" -ForegroundColor Yellow

$allMdFiles = Get-ChildItem -Path . -Recurse -Filter "*.md" -File | Where-Object { 
    $_.FullName -notmatch "node_modules|\.next|\.git|out|hardware\\lib" 
} | ForEach-Object { $_.FullName.Replace((Get-Location).Path + "\", "") }

$filesToDelete = @()
foreach ($file in $allMdFiles) {
    $shouldKeep = $false
    foreach ($keep in $allFilesToKeep) {
        if ($file -eq $keep -or $file.Replace("\", "/") -eq $keep.Replace("\", "/")) {
            $shouldKeep = $true
            break
        }
    }
    if (-not $shouldKeep) {
        $filesToDelete += $file
    }
}

if ($filesToDelete.Count -eq 0) {
    Write-Host "  ℹ️  Aucun fichier à supprimer" -ForegroundColor Gray
} else {
    $filesToDelete | ForEach-Object { Write-Host "  ❌ $_" -ForegroundColor Red }
    
    Write-Host ""
    $confirm = Read-Host "Voulez-vous supprimer ces $($filesToDelete.Count) fichier(s) ? (O/N)"
    if ($confirm -eq "O" -or $confirm -eq "o") {
        $deleted = 0
        foreach ($file in $filesToDelete) {
            try {
                Remove-Item $file -Force -ErrorAction Stop
                Write-Host "  ✅ Supprimé: $file" -ForegroundColor Green
                $deleted++
            } catch {
                Write-Host "  ❌ Erreur: $file - $_" -ForegroundColor Red
            }
        }
        Write-Host ""
        Write-Host "✅ $deleted fichier(s) supprimé(s)" -ForegroundColor Green
    } else {
        Write-Host "❌ Suppression annulée" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "✅ Nettoyage terminé" -ForegroundColor Green

