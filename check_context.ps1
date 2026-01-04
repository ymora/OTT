# Vérifier le contexte autour de la ligne 292
$content = Get-Content "audit\scripts\Audit-Phases.ps1" -Encoding UTF8

Write-Host "Lignes 290-295:"
for ($i = 289; $i -lt 295 -and $i -lt $content.Count; $i++) {
    $lineNum = $i + 1
    $line = $content[$i]
    Write-Host "Ligne $lineNum`: '$line'"
}
