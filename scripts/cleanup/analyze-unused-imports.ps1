# Script d'analyse et nettoyage des imports inutilisés
# Analyse chaque fichier JS/JSX et identifie les imports non utilisés

param(
    [string]$Path = ".",
    [switch]$DryRun = $true,
    [switch]$Fix = $false
)

$ErrorActionPreference = 'Continue'

Write-Host "🔍 Analyse des imports inutilisés..." -ForegroundColor Cyan
Write-Host ""

# Obtenir tous les fichiers JS/JSX
$jsFiles = Get-ChildItem -Path $Path -Recurse -Include "*.js","*.jsx" -ErrorAction SilentlyContinue | 
    Where-Object { 
        $_.FullName -notmatch "node_modules|\.next|\.git|out|audit|scripts" -and
        $_.FullName -match "components|app|hooks|lib"
    }

$totalFiles = $jsFiles.Count
Write-Host "📁 Fichiers à analyser: $totalFiles" -ForegroundColor White
Write-Host ""

$totalUnused = 0
$filesWithUnused = @()

foreach ($file in $jsFiles) {
    $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
    if (-not $content) { continue }
    
    $relativePath = $file.FullName -replace [regex]::Escape((Get-Location).Path + "\"), ""
    $unusedImports = @()
    
    # Extraire tous les imports
    $importMatches = [regex]::Matches($content, '^import\s+(.+?)\s+from\s+[''"].+?[''"]', [System.Text.RegularExpressions.RegexOptions]::Multiline)
    
    foreach ($importMatch in $importMatches) {
        $importLine = $importMatch.Groups[1].Value.Trim()
        
        # Parser l'import
        if ($importLine -match '^\{(.+)\}$') {
            # Import nommé: { a, b, c }
            $importedNames = $matches[1] -split ',' | ForEach-Object { $_.Trim() }
            foreach ($name in $importedNames) {
                # Ignorer les imports avec 'as'
                $actualName = if ($name -match '(.+?)\s+as\s+') { $matches[1].Trim() } else { $name }
                
                # Vérifier si utilisé dans le fichier (hors de la ligne d'import)
                $usagePattern = "\b$([regex]::Escape($actualName))\b"
                $contentWithoutImport = $content.Substring($importMatch.Index + $importMatch.Length)
                if ($contentWithoutImport -notmatch $usagePattern) {
                    $unusedImports += "$actualName (nommé)"
                }
            }
        } elseif ($importLine -match '^\*\s+as\s+(\w+)$') {
            # Import namespace: * as name
            $namespaceName = $matches[1]
            $usagePattern = "\b$([regex]::Escape($namespaceName))\."
            $contentWithoutImport = $content.Substring($importMatch.Index + $importMatch.Length)
            if ($contentWithoutImport -notmatch $usagePattern) {
                $unusedImports += "$namespaceName (namespace)"
            }
        } elseif ($importLine -match '^default\s+(\w+)$') {
            # Import default: default name
            $defaultName = $matches[1]
            $usagePattern = "\b$([regex]::Escape($defaultName))\b"
            $contentWithoutImport = $content.Substring($importMatch.Index + $importMatch.Length)
            if ($contentWithoutImport -notmatch $usagePattern) {
                $unusedImports += "$defaultName (default)"
            }
        } else {
            # Import default simple: import Name
            $defaultName = $importLine
            $usagePattern = "\b$([regex]::Escape($defaultName))\b"
            $contentWithoutImport = $content.Substring($importMatch.Index + $importMatch.Length)
            if ($contentWithoutImport -notmatch $usagePattern) {
                $unusedImports += "$defaultName (default)"
            }
        }
    }
    
    if ($unusedImports.Count -gt 0) {
        $totalUnused += $unusedImports.Count
        $filesWithUnused += @{
            File = $relativePath
            Unused = $unusedImports
            Count = $unusedImports.Count
        }
        
        if ($DryRun) {
            Write-Host "  📄 $relativePath" -ForegroundColor Yellow
            foreach ($unused in $unusedImports) {
                Write-Host "     - $unused" -ForegroundColor Gray
            }
        }
    }
}

Write-Host ""
Write-Host "📊 Total imports inutilisés détectés: $totalUnused dans $($filesWithUnused.Count) fichier(s)" -ForegroundColor $(if ($totalUnused -gt 0) { "Yellow" } else { "Green" })

if ($Fix -and $filesWithUnused.Count -gt 0) {
    Write-Host ""
    Write-Host "🔧 Correction automatique..." -ForegroundColor Green
    Write-Host "⚠️  ATTENTION: La correction automatique nécessite une vérification manuelle pour éviter les faux positifs" -ForegroundColor Yellow
    Write-Host "   (imports dynamiques, imports conditionnels, etc.)" -ForegroundColor Yellow
}

return $filesWithUnused

