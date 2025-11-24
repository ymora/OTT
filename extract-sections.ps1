# Script d'extraction pour refactorisation api.php
# Extrait les sections vers des modules séparés

$apiFile = "api.php"
$content = Get-Content $apiFile -Raw
$lines = $content -split "`n"

# Trouver les sections
$helpersStart = 188  # JWT FUNCTIONS
$helpersEnd = 518    # Fin runSqlFile
$authHandlersStart = 981
$authHandlersEnd = 1447

Write-Host "Extraction en cours..." -ForegroundColor Cyan
