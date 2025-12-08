# Script de test des endpoints API
# Usage: .\scripts\test-api-endpoints.ps1

param(
    [string]$API_URL = $env:API_URL,
    [string]$JWT_TOKEN = $env:JWT_TOKEN
)

if (-not $API_URL) {
    $API_URL = "https://ott-jbln.onrender.com"
    Write-Host "⚠️  API_URL non défini, utilisation de la valeur par défaut: $API_URL" -ForegroundColor Yellow
}

Write-Host "`n🧪 TEST ENDPOINTS API OTT" -ForegroundColor Cyan
Write-Host "===========================" -ForegroundColor Cyan
Write-Host "API URL: $API_URL" -ForegroundColor Gray
Write-Host ""

# Fonctions
function Write-Section { param([string]$Text) Write-Host "`n=== $Text ===" -ForegroundColor Cyan }
function Write-OK { param([string]$Text) Write-Host "  ✅ $Text" -ForegroundColor Green }
function Write-Warn { param([string]$Text) Write-Host "  ⚠️  $Text" -ForegroundColor Yellow }
function Write-Err { param([string]$Text) Write-Host "  ❌ $Text" -ForegroundColor Red }
function Write-Info { param([string]$Text) Write-Host "  ℹ️  $Text" -ForegroundColor Gray }

function Test-Endpoint {
    param(
        [string]$Method,
        [string]$Path,
        [hashtable]$Headers = @{},
        [string]$Body = $null
    )
    
    try {
        $uri = "$API_URL$Path"
        $params = @{
            Method = $Method
            Uri = $uri
            Headers = $Headers
            ContentType = "application/json"
            ErrorAction = "Stop"
        }
        
        if ($Body) {
            $params.Body = $Body
        }
        
        $response = Invoke-RestMethod @params
        return @{ Success = $true; Data = $response; StatusCode = 200 }
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        $errorMessage = $_.Exception.Message
        return @{ Success = $false; StatusCode = $statusCode; Error = $errorMessage }
    }
}

# 1. Test Health Check
Write-Section "1. Health Check"
$result = Test-Endpoint -Method "GET" -Path "/api.php/health"
if ($result.Success) {
    Write-OK "Health check réussi"
    Write-Info ($result.Data | ConvertTo-Json -Depth 2)
} else {
    Write-Err "Health check échoué: $($result.Error)"
}

# 2. Test Liste Dispositifs
Write-Section "2. Liste Dispositifs"
$headers = @{}
if ($JWT_TOKEN) {
    $headers["Authorization"] = "Bearer $JWT_TOKEN"
}
$result = Test-Endpoint -Method "GET" -Path "/api.php/devices" -Headers $headers
if ($result.Success) {
    Write-OK "Liste dispositifs récupérée"
    $deviceCount = if ($result.Data.devices) { $result.Data.devices.Count } else { 0 }
    Write-Info "$deviceCount dispositif(s) trouvé(s)"
} else {
    Write-Err "Échec récupération dispositifs: HTTP $($result.StatusCode) - $($result.Error)"
}

# 3. Test Firmwares
Write-Section "3. Liste Firmwares"
$result = Test-Endpoint -Method "GET" -Path "/api.php/firmwares" -Headers $headers
if ($result.Success) {
    Write-OK "Liste firmwares récupérée"
    $fwCount = if ($result.Data.firmwares) { $result.Data.firmwares.Count } else { 0 }
    Write-Info "$fwCount firmware(s) trouvé(s)"
} else {
    Write-Err "Échec récupération firmwares: HTTP $($result.StatusCode) - $($result.Error)"
}

# 4. Test Patients
Write-Section "4. Liste Patients"
$result = Test-Endpoint -Method "GET" -Path "/api.php/patients" -Headers $headers
if ($result.Success) {
    Write-OK "Liste patients récupérée"
    $patientCount = if ($result.Data.patients) { $result.Data.patients.Count } else { 0 }
    Write-Info "$patientCount patient(s) trouvé(s)"
} else {
    Write-Err "Échec récupération patients: HTTP $($result.StatusCode) - $($result.Error)"
}

# 5. Test Envoi Mesure (simulation)
Write-Section "5. Test Envoi Mesure"
$testMeasurement = @{
    sim_iccid = "8933150821051278837"
    device_serial = "OTT-25-001"
    device_name = "OTT-8837"
    firmware_version = "1.0"
    flowrate = 0.5
    battery = 75.5
    signal_strength = -85
    timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
} | ConvertTo-Json

$result = Test-Endpoint -Method "POST" -Path "/api.php/devices/measurements" -Headers $headers -Body $testMeasurement
if ($result.Success) {
    Write-OK "Mesure envoyée avec succès"
    Write-Info ($result.Data | ConvertTo-Json -Depth 2)
} else {
    Write-Err "Échec envoi mesure: HTTP $($result.StatusCode) - $($result.Error)"
}

Write-Host "`n✅ Tests terminés" -ForegroundColor Green

