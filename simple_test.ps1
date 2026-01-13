# Test API simple
$body = @{email="ymora@free.fr"; password="Ym120879"} | ConvertTo-Json
$response = Invoke-RestMethod -Uri "http://localhost:8000/api.php/auth/login" -Method POST -ContentType "application/json" -Body $body
Write-Host "Login OK, token: $($response.token.Substring(0,20))..."

$headers = @{Authorization="Bearer $($response.token)"; "Content-Type"="application/json"}

# Test archivage patient
try {
    $archive = Invoke-RestMethod -Uri "http://localhost:8000/api.php/patients/3/archive" -Method PATCH -Headers $headers
    Write-Host "Archive patient OK: $($archive.message)"
} catch {
    Write-Host "Archive patient ERROR: $($_.ErrorDetails.Content)"
}

# Test restauration patient
try {
    $restore = Invoke-RestMethod -Uri "http://localhost:8000/api.php/patients/3/restore" -Method PATCH -Headers $headers
    Write-Host "Restore patient OK: $($restore.message)"
} catch {
    Write-Host "Restore patient ERROR: $($_.ErrorDetails.Content)"
}
