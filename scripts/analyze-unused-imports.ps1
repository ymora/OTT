# Script pour analyser les imports inutilisés dans les fichiers JavaScript/JSX
param(
    [string]$Path = "."
)

Write-Host "🔍 Analyse des imports inutilisés..." -ForegroundColor Cyan
Write-Host ""

$files = Get-ChildItem -Path $Path -Recurse -Include "*.js","*.jsx" | 
    Where-Object { 
        $_.FullName -notmatch "node_modules|\.next|\.git|out|audit|scripts" -and
        $_.FullName -match "components|app|hooks|lib"
    }

$totalUnused = 0
$filesWithUnused = @()

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    $lines = Get-Content $file.FullName
    
    # Extraire tous les imports
    $importMatches = [regex]::Matches($content, '^import\s+([^from]+)\s+from\s+[''"]([^''"]+)[''"]', [System.Text.RegularExpressions.RegexOptions]::Multiline)
    
    $unusedInFile = @()
    
    foreach ($importMatch in $importMatches) {
        $importStatement = $importMatch.Groups[1].Value.Trim()
        $modulePath = $importMatch.Groups[2].Value
        
        # Gérer les imports nommés { a, b, c }
        if ($importStatement -match '^\{(.+)\}$') {
            $namedImports = $matches[1] -split ',' | ForEach-Object { 
                $item = $_.Trim()
                # Gérer "import as alias"
                if ($item -match '(.+)\s+as\s+(\w+)') {
                    @{Original=$matches[1].Trim(); Alias=$matches[2].Trim()}
                } else {
                    @{Original=$item; Alias=$item}
                }
            }
            
            foreach ($namedImport in $namedImports) {
                $importName = $namedImport.Alias
                # Vérifier si l'import est utilisé (hors de la ligne d'import elle-même)
                $usagePattern = "\b$importName\b"
                $contentWithoutImport = $content -replace $importMatch.Value, ""
                
                # Exclure les commentaires et les chaînes
                $codeOnly = $contentWithoutImport -replace '//.*?$', '' -replace '/\*.*?\*/', '' -replace '`[^`]*`', '' -replace "'[^']*'", '' -replace '"[^"]*"', ''
                
                if ($codeOnly -notmatch $usagePattern) {
                    $lineNum = ($content.Substring(0, $importMatch.Index) -split "`n").Count
                    $unusedInFile += @{
                        Name = $importName
                        Line = $lineNum
                        Type = "named"
                    }
                }
            }
        }
        # Gérer les imports par défaut import X from ...
        elseif ($importStatement -notmatch '^\*') {
            $defaultImport = $importStatement.Trim()
            if ($defaultImport -and $defaultImport -ne 'type') {
                $usagePattern = "\b$defaultImport\b"
                $contentWithoutImport = $content -replace $importMatch.Value, ""
                $codeOnly = $contentWithoutImport -replace '//.*?$', '' -replace '/\*.*?\*/', '' -replace '`[^`]*`', '' -replace "'[^']*'", '' -replace '"[^"]*"', ''
                
                if ($codeOnly -notmatch $usagePattern) {
                    $lineNum = ($content.Substring(0, $importMatch.Index) -split "`n").Count
                    $unusedInFile += @{
                        Name = $defaultImport
                        Line = $lineNum
                        Type = "default"
                    }
                }
            }
        }
    }
    
    if ($unusedInFile.Count -gt 0) {
        $totalUnused += $unusedInFile.Count
        $relativePath = $file.FullName -replace [regex]::Escape($PWD.Path + "\"), ""
        $filesWithUnused += @{
            File = $relativePath
            Unused = $unusedInFile
        }
    }
}

Write-Host "📊 Résultats:" -ForegroundColor Yellow
Write-Host "  Total imports inutilisés: $totalUnused" -ForegroundColor White
Write-Host "  Fichiers concernés: $($filesWithUnused.Count)" -ForegroundColor White
Write-Host ""

if ($filesWithUnused.Count -gt 0) {
    Write-Host "📄 Fichiers avec imports inutilisés:" -ForegroundColor Cyan
    foreach ($fileInfo in $filesWithUnused | Select-Object -First 20) {
        Write-Host "  $($fileInfo.File)" -ForegroundColor Gray
        foreach ($unused in $fileInfo.Unused) {
            Write-Host "    - ligne $($unused.Line): $($unused.Name) ($($unused.Type))" -ForegroundColor Yellow
        }
    }
    if ($filesWithUnused.Count -gt 20) {
        Write-Host "  ... et $($filesWithUnused.Count - 20) autres fichiers" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "✨ Analyse terminée!" -ForegroundColor Green

# Retourner les résultats pour traitement ultérieur
return @{
    TotalUnused = $totalUnused
    FilesWithUnused = $filesWithUnused
}

