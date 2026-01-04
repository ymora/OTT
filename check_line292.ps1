# Vérifier la ligne 292 en détail
$content = Get-Content "audit\scripts\Audit-Phases.ps1" -Encoding UTF8
$line = $content[291]  # Index 0-based, donc ligne 292 = index 291

Write-Host "Ligne 292 (brute): '$line'"
Write-Host "Longueur: $($line.Length)"
Write-Host "Caractères ASCII:"
for ($i = 0; $i -lt $line.Length; $i++) {
    $char = $line[$i]
    $ascii = [int][char]$char
    Write-Host "  Position $i`: '$char' (ASCII: $ascii)"
}
