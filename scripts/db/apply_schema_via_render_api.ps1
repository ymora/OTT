# ================================================================================
# Script pour appliquer le schéma SQL via l'API Render
# Alternative si psql et PHP ne sont pas disponibles localement
# ================================================================================

param(
    [string]$ApiUrl = "https://ott-jbln.onrender.com",
    [string]$Token = "",
    [string]$SchemaFile = "schema.sql"
)

# Si SchemaFile ne contient pas de chemin, chercher dans sql/
if ($SchemaFile -notmatch "[/\\]" -and $SchemaFile -ne "schema.sql") {
    # Pour les fichiers comme "create_admin_user.sql", chercher dans sql/
    $SchemaFile = $SchemaFile
}

Write-Host "`n🔧 Application du schéma SQL via l'API Render" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Gray
Write-Host ""

# Construire le chemin du fichier SQL
# Si SchemaFile ne contient pas de chemin, chercher dans sql/
if ($SchemaFile -notmatch "[/\\]") {
    $fullSchemaPath = Join-Path $PSScriptRoot "..\..\sql\$SchemaFile"
} else {
    $fullSchemaPath = Join-Path $PSScriptRoot "..\..\$SchemaFile"
}

# Vérifier que le fichier existe
if (-not (Test-Path $fullSchemaPath)) {
    Write-Host "❌ Erreur: Fichier schéma introuvable: $fullSchemaPath" -ForegroundColor Red
    Write-Host "   Vérifiez que le fichier existe dans sql/" -ForegroundColor Yellow
    exit 1
}

Write-Host "📋 Fichier schéma: $fullSchemaPath" -ForegroundColor Gray
Write-Host "🌐 API URL: $ApiUrl" -ForegroundColor Gray
Write-Host ""

# Option 1: Utiliser l'endpoint de migration si un token est fourni
if ($Token) {
    Write-Host "🔍 Tentative via endpoint API avec authentification..." -ForegroundColor Yellow
    
    try {
        $headers = @{
            "Authorization" = "Bearer $Token"
            "Content-Type" = "application/json"
        }
        
        $body = @{
            file = $SchemaFile
        } | ConvertTo-Json
        
        $response = Invoke-RestMethod -Uri "$ApiUrl/api.php/admin/migrations/run" `
            -Method POST `
            -Headers $headers `
            -Body $body `
            -TimeoutSec 120 `
            -ErrorAction Stop
        
        if ($response.success) {
            Write-Host "✅ Schéma appliqué avec succès via l'API !" -ForegroundColor Green
            if ($response.logs) {
                $response.logs | ForEach-Object {
                    Write-Host "   $_" -ForegroundColor Gray
                }
            }
            exit 0
        } else {
            Write-Host "❌ Erreur API: $($response.error)" -ForegroundColor Red
        }
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "⚠️  Erreur lors de l'appel API avec token (code $statusCode)" -ForegroundColor Yellow
        Write-Host "   Message: $($_.Exception.Message)" -ForegroundColor Gray
        Write-Host "   Continuons avec l'option alternative..." -ForegroundColor Gray
    }
}

# Option 2: Utiliser l'endpoint sans authentification (si autorisé)
Write-Host ""
Write-Host "🔍 Tentative via endpoint API sans authentification..." -ForegroundColor Yellow
Write-Host "   (Nécessite que ALLOW_MIGRATION_ENDPOINT=true sur Render)" -ForegroundColor Gray

try {
    $body = @{
        file = $SchemaFile
    } | ConvertTo-Json
    
    # Utiliser Invoke-WebRequest pour pouvoir lire le body d'erreur
    $response = Invoke-WebRequest -Uri "$ApiUrl/api.php/admin/migrations/run" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body `
        -TimeoutSec 120 `
        -ErrorAction Stop
    
    $responseData = $response.Content | ConvertFrom-Json
    
    if ($responseData.success) {
        Write-Host "✅ Schéma appliqué avec succès via l'API !" -ForegroundColor Green
        if ($responseData.logs) {
            $responseData.logs | ForEach-Object {
                Write-Host "   $_" -ForegroundColor Gray
            }
        }
        exit 0
    } else {
        Write-Host "❌ Erreur API: $($responseData.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    
    # Essayer de récupérer le message d'erreur détaillé
    $errorDetails = ""
    $errorBody = ""
    try {
        $errorStream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($errorStream)
        $errorBody = $reader.ReadToEnd()
        $reader.Close()
        $errorStream.Close()
        
        # Essayer de parser le JSON
        try {
            $errorDetails = $errorBody | ConvertFrom-Json -ErrorAction Stop
        } catch {
            # Si ce n'est pas du JSON, utiliser le texte brut
            $errorDetails = $errorBody
        }
    } catch {
        # Si on ne peut pas lire le stream, utiliser le message d'exception
        $errorDetails = $_.Exception.Message
        $errorBody = $_.Exception.Message
    }
    
    if ($statusCode -eq 403) {
        Write-Host "❌ Accès refusé (403)" -ForegroundColor Red
        Write-Host ""
        Write-Host "💡 Solutions:" -ForegroundColor Yellow
        Write-Host "   1. Obtenir un token JWT et utiliser -Token" -ForegroundColor Gray
        Write-Host "   2. Configurer ALLOW_MIGRATION_ENDPOINT=true sur Render" -ForegroundColor Gray
        Write-Host "   3. Utiliser un client PostgreSQL (pgAdmin) pour appliquer sql/schema.sql" -ForegroundColor Gray
    } elseif ($statusCode -eq 500) {
        Write-Host "❌ Erreur serveur (500) - Problème côté API" -ForegroundColor Red
        Write-Host ""
        Write-Host "📋 Détails de l'erreur:" -ForegroundColor Yellow
        if ($errorDetails) {
            if ($errorDetails.PSObject.Properties.Name -contains 'error') {
                Write-Host "   Erreur: $($errorDetails.error)" -ForegroundColor Red
            }
            if ($errorDetails.PSObject.Properties.Name -contains 'message') {
                Write-Host "   Message: $($errorDetails.message)" -ForegroundColor Red
            }
            if ($errorDetails.PSObject.Properties.Name -contains 'details') {
                Write-Host "   Détails: $($errorDetails.details | ConvertTo-Json -Compress)" -ForegroundColor Gray
            }
            if ($errorDetails.PSObject.Properties.Name -contains 'logs') {
                Write-Host "   Logs:" -ForegroundColor Gray
                if ($errorDetails.logs -is [Array]) {
                    $errorDetails.logs | ForEach-Object {
                        Write-Host "     $_" -ForegroundColor Gray
                    }
                } else {
                    Write-Host "     $($errorDetails.logs)" -ForegroundColor Gray
                }
            }
            # Afficher tout le JSON si disponible
            if ($errorBody -and $errorBody.Length -lt 2000) {
                Write-Host ""
                Write-Host "   Réponse complète:" -ForegroundColor Gray
                Write-Host "   $errorBody" -ForegroundColor DarkGray
            }
        } else {
            Write-Host "   $($_.Exception.Message)" -ForegroundColor Gray
            if ($errorBody) {
                Write-Host "   Réponse: $errorBody" -ForegroundColor DarkGray
            }
        }
        Write-Host ""
        Write-Host "💡 Vérifications:" -ForegroundColor Yellow
        Write-Host "   1. Vérifiez les logs de l'API sur Render (onglet 'Logs')" -ForegroundColor Gray
        Write-Host "   2. Vérifiez que DATABASE_URL est correctement configuré sur Render" -ForegroundColor Gray
        Write-Host "   3. Vérifiez que la base de données est accessible depuis l'API" -ForegroundColor Gray
        Write-Host "   4. Vérifiez que le fichier sql/schema.sql existe sur Render" -ForegroundColor Gray
    } else {
        Write-Host "❌ Erreur lors de l'appel API: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "   Code HTTP: $statusCode" -ForegroundColor Gray
        if ($errorDetails) {
            Write-Host "   Détails: $errorDetails" -ForegroundColor Gray
        }
    }
    exit 1
}

