# Script pour détecter les imports réellement inutilisés
# Vérifie que les imports sont utilisés dans le code

Write-Host "🔍 Détection imports inutilisés..." -ForegroundColor Cyan
Write-Host ""

$files = Get-ChildItem -Path app,components -Recurse -Filter "*.js" | Where-Object { $_.FullName -notmatch "node_modules" }

$totalUnused = 0

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    $lines = Get-Content $file.FullName
    
    # Extraire les imports
    $imports = @()
    foreach ($line in $lines) {
        if ($line -match '^import\s+(?:(\w+)|(?:\{([^}]+)\})|(?:\*\s+as\s+(\w+)))\s+from') {
            if ($matches[1]) {
                # import X from
                $imports += $matches[1]
            } elseif ($matches[2]) {
                # import { X, Y } from
                $parts = $matches[2] -split ',' | ForEach-Object { $_.Trim() -replace 'as\s+\w+', '' -replace '\s+as\s+\w+', '' }
                $imports += $parts | ForEach-Object { if ($_ -match '^\s*(\w+)') { $matches[1] } }
            } elseif ($matches[3]) {
                # import * as X from
                $imports += $matches[3]
            }
        }
    }
    
    # Vérifier chaque import
    $unused = @()
    foreach ($import in $imports) {
        if ($import) {
            # Compter les occurrences (hors ligne d'import)
            $pattern = "\b$import\b"
            $count = ([regex]::Matches($content, $pattern)).Count
            # Si seulement 1 occurrence, c'est probablement juste l'import
            if ($count -le 1) {
                $unused += $import
            }
        }
    }
    
    if ($unused.Count -gt 0) {
        Write-Host "⚠️  $($file.Name): $($unused.Count) import(s) potentiellement inutilisé(s)" -ForegroundColor Yellow
        Write-Host "   $($unused -join ', ')" -ForegroundColor Gray
        $totalUnused += $unused.Count
    }
}

Write-Host ""
$color = if ($totalUnused -gt 0) { "Yellow" } else { "Green" }
Write-Host "Total: $totalUnused import(s) potentiellement inutilise(s)" -ForegroundColor $color

