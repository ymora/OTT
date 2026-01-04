# Vérifier les accolades dans la fonction Parse-PhaseSelection
$content = Get-Content "audit\scripts\Audit-Phases.ps1" -Encoding UTF8
$inFunction = $false
$braceCount = 0
$lineNumber = 0
$startLine = 0

foreach ($line in $content) {
    $lineNumber++
    
    if ($line -match "function Parse-PhaseSelection") {
        $inFunction = $true
        $startLine = $lineNumber
        Write-Host "Début de la fonction à la ligne $lineNumber"
        $braceCount = 1  # La fonction elle-même a une accolade ouvrante
        continue
    }
    
    if ($inFunction) {
        # Vérifier si on rencontre une nouvelle fonction
        if ($line -match "^\s*function\s+\w+" -and $lineNumber -gt $startLine + 1) {
            Write-Host "Nouvelle fonction détectée à la ligne $lineNumber"
            Write-Host "Balance des accolades finale: $braceCount"
            if ($braceCount -ne 0) {
                Write-Host "ERREUR: Les accolades ne sont pas équilibrées!" -ForegroundColor Red
            }
            break
        }
        
        $openCount = ($line | Select-String -Pattern "\{" -AllMatches).Matches.Count
        $closeCount = ($line | Select-String -Pattern "\}" -AllMatches).Matches.Count
        
        $braceCount += $openCount - $closeCount
        
        if ($openCount -gt 0 -or $closeCount -gt 0) {
            Write-Host "Ligne $lineNumber`: $line (Balance: $braceCount)"
        }
        
        if ($braceCount -eq 0 -and $lineNumber -gt $startLine) {
            Write-Host "Fonction terminée correctement à la ligne $lineNumber"
            break
        }
    }
}
