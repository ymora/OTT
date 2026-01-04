# Script simple pour debugger le problème de syntaxe
$content = Get-Content "audit\scripts\Audit-Phases.ps1" -Encoding UTF8
$openBraces = 0
$closeBraces = 0
$lineNumber = 0

foreach ($line in $content) {
    $lineNumber++
    $openCount = ($line | Select-String -Pattern "\{" -AllMatches).Matches.Count
    $closeCount = ($line | Select-String -Pattern "\}" -AllMatches).Matches.Count
    
    $openBraces += $openCount
    $closeBraces += $closeCount
    
    if ($openCount -gt 0 -or $closeCount -gt 0) {
        Write-Host "Ligne $lineNumber`: $line (Open: $openCount, Close: $closeCount)"
    }
}

Write-Host "`nTotal - Open: $openBraces, Close: $closeBraces"
Write-Host "Balance: $($openBraces - $closeBraces)"
