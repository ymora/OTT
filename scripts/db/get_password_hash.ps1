# Script simple pour obtenir le hash du mot de passe depuis l'API
# Usage: .\scripts\db\get_password_hash.ps1 -Password "Ym120879" -ApiUrl "https://ott-jbln.onrender.com"

param(
    [string]$Password = "Ym120879",
    [string]$ApiUrl = "https://ott-jbln.onrender.com"
)

Write-Host "🔑 Génération du hash pour le mot de passe..." -ForegroundColor Cyan
Write-Host ""

$body = @{
    password = $Password
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$ApiUrl/api.php/admin/generate-password-hash" `
        -Method POST `
        -Body $body `
        -ContentType "application/json" `
        -TimeoutSec 30 `
        -ErrorAction Stop
    
    if ($response.success) {
        Write-Host "✅ Hash généré avec succès !" -ForegroundColor Green
        Write-Host ""
        Write-Host "Password: $($response.password)" -ForegroundColor Gray
        Write-Host "Hash: $($response.hash)" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "SQL à mettre dans schema.sql:" -ForegroundColor Cyan
        Write-Host $response.sql -ForegroundColor White
        Write-Host ""
        
        # Copier le hash dans le presse-papier
        $response.hash | Set-Clipboard
        Write-Host "✅ Hash copié dans le presse-papier !" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Erreur: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

