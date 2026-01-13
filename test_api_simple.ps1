# Test API simple après unification

Write-Host "🚀 TESTS API SIMPLE" -ForegroundColor Green

# Login
$loginBody = @{email="ymora@free.fr"; password="Ym120879"} | ConvertTo-Json
$loginResponse = Invoke-RestMethod -Uri "http://localhost:8000/api.php/auth/login" -Method POST -ContentType "application/json" -Body $loginBody
$token = $loginResponse.token
Write-Host "✅ Login OK" -ForegroundColor Green

$headers = @{Authorization="Bearer $token"; "Content-Type"="application/json"}

# Test patients
try {
    $patients = Invoke-RestMethod -Uri "http://localhost:8000/api.php/patients" -Method GET -Headers $headers
    Write-Host "✅ Patients API: $($patients.patients.count) patients" -ForegroundColor Green
} catch {
    Write-Host "❌ Patients API: $($_.ErrorDetails.Content)" -ForegroundColor Red
}

# Test users
try {
    $users = Invoke-RestMethod -Uri "http://localhost:8000/api.php/users" -Method GET -Headers $headers
    Write-Host "✅ Users API: $($users.users.count) users" -ForegroundColor Green
} catch {
    Write-Host "❌ Users API: $($_.ErrorDetails.Content)" -ForegroundColor Red
}

# Test devices
try {
    $devices = Invoke-RestMethod -Uri "http://localhost:8000/api.php/devices" -Method GET -Headers $headers
    Write-Host "✅ Devices API: $($devices.devices.count) devices" -ForegroundColor Green
} catch {
    Write-Host "❌ Devices API: $($_.ErrorDetails.Content)" -ForegroundColor Red
}

Write-Host "🎉 Tests terminés" -ForegroundColor Green
