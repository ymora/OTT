# ============================================================================
# Script PowerShell - Migration Firmware BYTEA Automatique
# ============================================================================
# Attend le déploiement et exécute la migration automatiquement
# ============================================================================

param(
    [string]$API_URL = "https://ott-jbln.onrender.com",
    [int]$MaxRetries = 10,
    [int]$RetryDelay = 30
)

Write-Host ""
Write-Host "🤖 Migration Firmware BYTEA - Mode Automatique" -ForegroundColor Cyan
Write-Host ""

# Fonction pour vérifier si l'endpoint existe
function Test-Endpoint {
    param([string]$Url, [string]$Token = $null)
    
    try {
        $headers = @{"Content-Type" = "application/json"}
        if ($Token) {
            $headers["Authorization"] = "Bearer $Token"
        }
        
        $response = Invoke-WebRequest -Uri $Url `
            -Method POST `
            -Headers $headers `
            -Body "{}" `
            -UseBasicParsing `
            -ErrorAction Stop
        
        return @{Success = $true; Response = $response}
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        return @{Success = $false; StatusCode = $statusCode; Error = $_.Exception.Message}
    }
}

# Étape 1: Vérifier que l'API est accessible
Write-Host "1️⃣  Vérification de l'API..." -ForegroundColor Yellow
try {
    $health = Invoke-WebRequest -Uri "$API_URL/api.php/health" -UseBasicParsing -ErrorAction Stop
    $healthData = $health.Content | ConvertFrom-Json
    Write-Host "   ✅ API accessible (Version: $($healthData.version))" -ForegroundColor Green
} catch {
    Write-Host "   ❌ API non accessible: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   ⏳ Attendez que Render déploie l'application" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# Étape 2: Attendre que l'endpoint soit disponible
Write-Host "2️⃣  Attente de la disponibilité de l'endpoint..." -ForegroundColor Yellow
$endpointUrl = "$API_URL/api.php/migrate/firmware-blob"
$attempt = 0
$endpointReady = $false

while ($attempt -lt $MaxRetries -and -not $endpointReady) {
    $attempt++
    Write-Host "   Tentative $attempt/$MaxRetries..." -ForegroundColor Gray
    
    $result = Test-Endpoint -Url $endpointUrl
    
    if ($result.Success) {
        $endpointReady = $true
        Write-Host "   ✅ Endpoint disponible !" -ForegroundColor Green
    } elseif ($result.StatusCode -eq 401 -or $result.StatusCode -eq 403) {
        $endpointReady = $true
        Write-Host "   ✅ Endpoint disponible (authentification requise)" -ForegroundColor Green
    } elseif ($result.StatusCode -eq 404) {
        Write-Host "   ⏳ Endpoint pas encore déployé, attente ${RetryDelay}s..." -ForegroundColor Yellow
        if ($attempt -lt $MaxRetries) {
            Start-Sleep -Seconds $RetryDelay
        }
    } else {
        Write-Host "   ⚠️  Erreur: $($result.Error)" -ForegroundColor Yellow
        if ($attempt -lt $MaxRetries) {
            Start-Sleep -Seconds $RetryDelay
        }
    }
}

if (-not $endpointReady) {
    Write-Host "   ❌ Endpoint non disponible après $MaxRetries tentatives" -ForegroundColor Red
    Write-Host "   💡 Le déploiement prend plus de temps que prévu" -ForegroundColor Yellow
    Write-Host "   💡 Réessayez dans quelques minutes" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# Étape 3: Demander le token JWT si nécessaire
Write-Host "3️⃣  Authentification..." -ForegroundColor Yellow
Write-Host "   🔐 Token JWT requis (droits admin)" -ForegroundColor Gray
Write-Host "   📝 Pour obtenir le token:" -ForegroundColor Cyan
Write-Host "      1. Ouvrez https://ott-jbln.onrender.com" -ForegroundColor Gray
Write-Host "      2. F12 → Console → localStorage.getItem('ott_token')" -ForegroundColor Gray
Write-Host ""
$token = Read-Host "Token JWT (ou laissez vide pour annuler)"

if ([string]::IsNullOrWhiteSpace($token)) {
    Write-Host "   ❌ Annulé" -ForegroundColor Red
    exit 1
}

Write-Host "   ✅ Token fourni" -ForegroundColor Green
Write-Host ""

# Étape 4: Exécuter la migration
Write-Host "4️⃣  Exécution de la migration..." -ForegroundColor Yellow
Write-Host "   URL: $endpointUrl" -ForegroundColor Gray
Write-Host ""

try {
    $response = Invoke-WebRequest -Uri $endpointUrl `
        -Method POST `
        -Headers @{
            "Authorization" = "Bearer $token"
            "Content-Type" = "application/json"
        } `
        -Body "{}" `
        -UseBasicParsing `
        -ErrorAction Stop
    
    $result = $response.Content | ConvertFrom-Json
    
    if ($result.success) {
        Write-Host "   ✅ Migration appliquée avec succès !" -ForegroundColor Green
        Write-Host ""
        Write-Host "📊 Résultats:" -ForegroundColor Cyan
        foreach ($res in $result.results) {
            $status = if ($res.status -eq 'success') { "✅" } elseif ($res.status -eq 'already_exists') { "ℹ️" } else { "⚠️" }
            Write-Host "   $status $($res.command)" -ForegroundColor $(if ($res.status -eq 'success') { "Green" } elseif ($res.status -eq 'already_exists') { "Gray" } else { "Yellow" })
        }
        Write-Host ""
        Write-Host "📋 Colonnes créées:" -ForegroundColor Cyan
        foreach ($col in $result.columns) {
            Write-Host "   ✅ $($col.column_name) ($($col.data_type))" -ForegroundColor Green
        }
        Write-Host ""
        Write-Host "✅ Migration terminée avec succès !" -ForegroundColor Green
        Write-Host ""
        Write-Host "📝 Prochaines étapes:" -ForegroundColor Cyan
        Write-Host "   - Les nouveaux uploads .ino seront stockés dans la DB" -ForegroundColor Gray
        Write-Host "   - Les compilations .bin seront stockées dans la DB" -ForegroundColor Gray
        Write-Host "   - Plus de perte de fichiers lors des redéploiements !" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host "   ❌ Erreur: $($result.error)" -ForegroundColor Red
        exit 1
    }
    
} catch {
    Write-Host "   ❌ Erreur lors de l'appel API:" -ForegroundColor Red
    Write-Host "      $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.Exception.Response) {
        try {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $responseBody = $reader.ReadToEnd()
            Write-Host "      Réponse: $responseBody" -ForegroundColor Red
        } catch {
            # Ignorer si on ne peut pas lire la réponse
        }
    }
    
    Write-Host ""
    Write-Host "💡 Solutions:" -ForegroundColor Yellow
    Write-Host "   1. Vérifiez que le token JWT est valide" -ForegroundColor Cyan
    Write-Host "   2. Vérifiez que vous avez les droits admin" -ForegroundColor Cyan
    Write-Host "   3. Vérifiez que l'endpoint est bien déployé" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

