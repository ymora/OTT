# ═══════════════════════════════════════════════════════════════════
# TEST RAPIDE API - Mode DEBUG activé
# ═══════════════════════════════════════════════════════════════════
# Ce script teste l'API et affiche l'erreur complète
# ═══════════════════════════════════════════════════════════════════

Write-Host "`n╔═══════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║          🧪 TEST API - DIAGNOSTIC ERREUR DATABASE               ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# URL de l'API (à adapter)
$API_URL = Read-Host "🌐 URL de votre API (ex: https://votre-api.onrender.com)"

Write-Host "`n⏳ Test de l'API en cours...`n" -ForegroundColor Gray

# ═══════════════════════════════════════════════════════════════════
# TEST 1: Vérifier que l'API est accessible
# ═══════════════════════════════════════════════════════════════════

Write-Host "📡 TEST 1: Connexion à l'API..." -ForegroundColor Yellow

try {
    $response = Invoke-WebRequest -Uri "$API_URL/api.php" -Method GET -UseBasicParsing -ErrorAction Stop
    Write-Host "✅ API accessible (Status: $($response.StatusCode))`n" -ForegroundColor Green
} catch {
    Write-Host "❌ Erreur de connexion à l'API:" -ForegroundColor Red
    Write-Host "   $($_.Exception.Message)`n" -ForegroundColor Red
    exit 1
}

# ═══════════════════════════════════════════════════════════════════
# TEST 2: Tenter de créer un dispositif de test
# ═══════════════════════════════════════════════════════════════════

Write-Host "📡 TEST 2: Création d'un dispositif de test..." -ForegroundColor Yellow

$testDevice = @{
    device_name = "TEST-DIAGNOSTIC-$(Get-Random -Maximum 9999)"
    sim_iccid = "TEST-DIAG-$(Get-Random -Maximum 999999999)"
    device_serial = "TEST-SERIAL-$(Get-Random -Maximum 999)"
    status = "inactive"
    patient_id = $null
} | ConvertTo-Json

Write-Host "`n📝 Données envoyées:" -ForegroundColor Gray
Write-Host $testDevice -ForegroundColor White

try {
    $headers = @{
        "Content-Type" = "application/json"
    }
    
    $response = Invoke-WebRequest `
        -Uri "$API_URL/api.php/devices" `
        -Method POST `
        -Headers $headers `
        -Body $testDevice `
        -UseBasicParsing `
        -ErrorAction Stop
    
    Write-Host "`n✅ DISPOSITIF CRÉÉ AVEC SUCCÈS!" -ForegroundColor Green
    Write-Host "`n📄 Réponse de l'API:" -ForegroundColor Cyan
    
    $jsonResponse = $response.Content | ConvertFrom-Json
    $jsonResponse | ConvertTo-Json -Depth 10 | Write-Host -ForegroundColor White
    
    Write-Host "`n✅ La base de données semble être à jour!" -ForegroundColor Green
    Write-Host "   Aucune erreur détectée.`n" -ForegroundColor Green
    
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    
    Write-Host "`n❌ ERREUR DÉTECTÉE (Status: $statusCode)!" -ForegroundColor Red
    Write-Host "─────────────────────────────────────────────────────────────────`n" -ForegroundColor Gray
    
    if ($_.ErrorDetails.Message) {
        Write-Host "📄 Réponse détaillée de l'API:" -ForegroundColor Yellow
        
        try {
            $errorJson = $_.ErrorDetails.Message | ConvertFrom-Json
            
            Write-Host "`nSuccess: " -NoNewline -ForegroundColor Gray
            Write-Host $errorJson.success -ForegroundColor $(if ($errorJson.success) { "Green" } else { "Red" })
            
            Write-Host "Error: " -NoNewline -ForegroundColor Gray
            Write-Host $errorJson.error -ForegroundColor Red
            
            if ($errorJson.details) {
                Write-Host "`nDétails techniques:" -ForegroundColor Yellow
                Write-Host $errorJson.details -ForegroundColor White
            }
            
            # Analyser le type d'erreur
            Write-Host "`n╔═══════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
            Write-Host "║                        DIAGNOSTIC                                 ║" -ForegroundColor Cyan
            Write-Host "╚═══════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan
            
            if ($errorJson.error -match "column.*does not exist") {
                Write-Host "🔍 PROBLÈME IDENTIFIÉ: Colonne manquante dans la base de données" -ForegroundColor Red
                Write-Host "`n📋 SOLUTION:" -ForegroundColor Yellow
                Write-Host "   1. Exécutez le script de vérification:" -ForegroundColor White
                Write-Host "      .\scripts\VERIFIER_DB_RENDER.ps1`n" -ForegroundColor Cyan
                Write-Host "   2. Appliquez les migrations sur Render:" -ForegroundColor White
                Write-Host "      sql/MIGRATION_COMPLETE_PRODUCTION.sql`n" -ForegroundColor Cyan
            }
            elseif ($errorJson.error -match "table.*does not exist") {
                Write-Host "🔍 PROBLÈME IDENTIFIÉ: Table manquante dans la base de données" -ForegroundColor Red
                Write-Host "`n📋 SOLUTION:" -ForegroundColor Yellow
                Write-Host "   Vous devez créer le schéma complet:" -ForegroundColor White
                Write-Host "   1. sql/schema.sql" -ForegroundColor Cyan
                Write-Host "   2. sql/MIGRATION_COMPLETE_PRODUCTION.sql`n" -ForegroundColor Cyan
            }
            elseif ($errorJson.error -match "constraint") {
                Write-Host "🔍 PROBLÈME IDENTIFIÉ: Violation de contrainte" -ForegroundColor Red
                Write-Host "`n📋 SOLUTION:" -ForegroundColor Yellow
                Write-Host "   Vérifiez les données envoyées (patient_id invalide, duplicata, etc.)`n" -ForegroundColor White
            }
            elseif ($errorJson.error -match "permission denied|authentication") {
                Write-Host "🔍 PROBLÈME IDENTIFIÉ: Problème d'authentification" -ForegroundColor Red
                Write-Host "`n📋 SOLUTION:" -ForegroundColor Yellow
                Write-Host "   Vérifiez les permissions de la base de données Render`n" -ForegroundColor White
            }
            else {
                Write-Host "🔍 ERREUR GÉNÉRIQUE: Database error" -ForegroundColor Red
                Write-Host "`n📋 RECOMMANDATIONS:" -ForegroundColor Yellow
                Write-Host "   1. Consultez les logs Render (render.com > Logs)" -ForegroundColor White
                Write-Host "   2. Cherchez '[handleCreateDevice]' ou '[handleUpdateDevice]'" -ForegroundColor White
                Write-Host "   3. L'erreur complète devrait apparaître avec le mode DEBUG activé`n" -ForegroundColor White
            }
            
        } catch {
            Write-Host $_.ErrorDetails.Message -ForegroundColor Red
        }
    } else {
        Write-Host "Aucun détail disponible. Erreur: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    Write-Host "`n📄 Consultez le guide complet:" -ForegroundColor Yellow
    Write-Host "   DIAGNOSTIC_ERREUR_DB.md`n" -ForegroundColor Cyan
}

# ═══════════════════════════════════════════════════════════════════
# RÉSUMÉ
# ═══════════════════════════════════════════════════════════════════

Write-Host "╔═══════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                        FIN DU TEST                                ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

Write-Host "📚 Ressources disponibles:" -ForegroundColor Yellow
Write-Host "   - DIAGNOSTIC_ERREUR_DB.md          (Guide complet)" -ForegroundColor White
Write-Host "   - scripts/VERIFIER_DB_RENDER.ps1   (Vérification base)" -ForegroundColor White
Write-Host "   - sql/MIGRATION_COMPLETE_PRODUCTION.sql (Migrations)`n" -ForegroundColor White

