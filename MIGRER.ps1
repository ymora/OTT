# ═══════════════════════════════════════════════════════════════════
# SCRIPT UNIQUE - MIGRATION BASE DE DONNÉES RENDER
# ═══════════════════════════════════════════════════════════════════

Write-Host "`n╔═══════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║           🚀 MIGRATION BASE DE DONNÉES RENDER                    ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# DATABASE_URL configurée
$DATABASE_URL = "postgresql://ott_data_user:lxNCXElZadbthGiOgT3cg2Y6JmMeMqUM@dpg-d4b6c015pdvs73ck6rp0-a.frankfurt-postgres.render.com/ott_data"
$MIGRATION_FILE = "sql\MIGRATION_COMPLETE_PRODUCTION.sql"

Write-Host "✅ Configuration automatique`n" -ForegroundColor Green

# Vérifier le fichier de migration
if (-not (Test-Path $MIGRATION_FILE)) {
    Write-Host "❌ Fichier de migration introuvable: $MIGRATION_FILE" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Fichier de migration trouvé`n" -ForegroundColor Green

# Vérifier psql
$psqlPath = Get-Command psql -ErrorAction SilentlyContinue

if (-not $psqlPath) {
    Write-Host "❌ psql n'est pas installé`n" -ForegroundColor Red
    Write-Host "📥 INSTALLATION RAPIDE:" -ForegroundColor Yellow
    Write-Host "   1. Téléchargez PostgreSQL: https://www.postgresql.org/download/windows/" -ForegroundColor White
    Write-Host "   2. Installez 'Command Line Tools' uniquement" -ForegroundColor White
    Write-Host "   3. Réessayez ce script`n" -ForegroundColor White
    
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
    Write-Host "OU : Utilisez la méthode API (nécessite connexion)" -ForegroundColor Yellow
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Yellow
    
    $useAPI = Read-Host "Voulez-vous utiliser la méthode API ? (o/N)"
    
    if ($useAPI -eq 'o' -or $useAPI -eq 'O') {
        Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
        Write-Host "📋 CONNEXION POUR OBTENIR LE TOKEN" -ForegroundColor Cyan
        Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Cyan
        
        $apiUrl = "https://ott-jbln.onrender.com"
        
        Write-Host "Entrez vos identifiants (compte admin requis) :`n" -ForegroundColor Yellow
        
        $email = Read-Host "📧 Email"
        $password = Read-Host "🔑 Mot de passe" -AsSecureString
        
        # Convertir le mot de passe sécurisé en texte
        $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
        $passwordText = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
        
        Write-Host "`n⏳ Connexion en cours..." -ForegroundColor Yellow
        
        try {
            # Se connecter pour obtenir le token
            $loginResponse = Invoke-RestMethod -Uri "$apiUrl/api.php/auth/login" `
                -Method POST `
                -Headers @{
                    "Content-Type" = "application/json"
                } `
                -Body (@{ email = $email; password = $passwordText } | ConvertTo-Json)
            
            if ($loginResponse.success -and $loginResponse.token) {
                $token = $loginResponse.token
                Write-Host "✅ Connexion réussie !`n" -ForegroundColor Green
                
                # Nettoyer le mot de passe de la mémoire
                $passwordText = $null
                [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)
                
                Write-Host "⏳ Exécution de la migration..." -ForegroundColor Yellow
                
                # Exécuter la migration avec le token
                $migrationResponse = Invoke-RestMethod -Uri "$apiUrl/api.php/admin/migrate-complete" `
                    -Method POST `
                    -Headers @{
                        "Authorization" = "Bearer $token"
                        "Content-Type" = "application/json"
                    }
                
                if ($migrationResponse.success) {
                    Write-Host "`n╔═══════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
                    Write-Host "║              ✅ MIGRATION RÉUSSIE !                              ║" -ForegroundColor Green
                    Write-Host "╚═══════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Green
                    
                    Write-Host ($migrationResponse | ConvertTo-Json -Depth 10) -ForegroundColor White
                    
                    Write-Host "`n✅ Testez maintenant: https://ymora.github.io/OTT/" -ForegroundColor Cyan
                    Write-Host "✅ L'erreur 'Database error' devrait avoir disparu !`n" -ForegroundColor Green
                } else {
                    Write-Host "`n❌ Erreur migration: $($migrationResponse.error)" -ForegroundColor Red
                }
            } else {
                Write-Host "`n❌ Erreur de connexion: $($loginResponse.error)" -ForegroundColor Red
            }
        } catch {
            $statusCode = $_.Exception.Response.StatusCode.value__
            
            Write-Host "`n❌ ERREUR:" -ForegroundColor Red
            
            if ($_.ErrorDetails.Message) {
                try {
                    $errorJson = $_.ErrorDetails.Message | ConvertFrom-Json
                    Write-Host "   $($errorJson.error)" -ForegroundColor Red
                } catch {
                    Write-Host "   $($_.ErrorDetails.Message)" -ForegroundColor Red
                }
            } else {
                Write-Host "   $($_.Exception.Message)" -ForegroundColor Red
            }
            
            if ($statusCode -eq 401 -or $statusCode -eq 403) {
                Write-Host "`n💡 Vérifiez vos identifiants (email et mot de passe)" -ForegroundColor Yellow
            }
        } finally {
            # Nettoyer le mot de passe de la mémoire
            if ($BSTR) {
                [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)
            }
        }
        
        exit
    } else {
        exit 1
    }
}

Write-Host "✅ psql disponible`n" -ForegroundColor Green

# Proposer les deux options
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "📋 MÉTHODE DE MIGRATION" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Cyan
Write-Host "1. Migration directe (psql) - Plus rapide" -ForegroundColor White
Write-Host "2. Migration via API (nécessite connexion)`n" -ForegroundColor White

$choice = Read-Host "Choisissez (1 ou 2) [Par défaut: 1]"

if ($choice -eq '2') {
    Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "📋 CONNEXION POUR OBTENIR LE TOKEN" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Cyan
    
    $apiUrl = "https://ott-jbln.onrender.com"
    
    Write-Host "Entrez vos identifiants (compte admin requis) :`n" -ForegroundColor Yellow
    
    $email = Read-Host "📧 Email"
    $password = Read-Host "🔑 Mot de passe" -AsSecureString
    
    # Convertir le mot de passe
    $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
    $passwordText = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
    
    Write-Host "`n⏳ Connexion en cours..." -ForegroundColor Yellow
    
    try {
        # Login
        $loginResponse = Invoke-RestMethod -Uri "$apiUrl/api.php/auth/login" `
            -Method POST `
            -Headers @{ "Content-Type" = "application/json" } `
            -Body (@{ email = $email; password = $passwordText } | ConvertTo-Json)
        
        if ($loginResponse.success -and $loginResponse.token) {
            $token = $loginResponse.token
            Write-Host "✅ Connexion réussie !`n" -ForegroundColor Green
            
            # Nettoyer le mot de passe
            $passwordText = $null
            [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)
            
            Write-Host "⏳ Exécution de la migration..." -ForegroundColor Yellow
            
            # Migration
            $migrationResponse = Invoke-RestMethod -Uri "$apiUrl/api.php/admin/migrate-complete" `
                -Method POST `
                -Headers @{
                    "Authorization" = "Bearer $token"
                    "Content-Type" = "application/json"
                }
            
            if ($migrationResponse.success) {
                Write-Host "`n╔═══════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
                Write-Host "║              ✅ MIGRATION RÉUSSIE !                              ║" -ForegroundColor Green
                Write-Host "╚═══════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Green
                
                Write-Host ($migrationResponse | ConvertTo-Json -Depth 10) -ForegroundColor White
                
                Write-Host "`n✅ Testez maintenant: https://ymora.github.io/OTT/" -ForegroundColor Cyan
                Write-Host "✅ L'erreur 'Database error' devrait avoir disparu !`n" -ForegroundColor Green
            } else {
                Write-Host "`n❌ Erreur migration: $($migrationResponse.error)" -ForegroundColor Red
            }
        } else {
            Write-Host "`n❌ Erreur de connexion: $($loginResponse.error)" -ForegroundColor Red
        }
    } catch {
        Write-Host "`n❌ ERREUR:" -ForegroundColor Red
        if ($_.ErrorDetails.Message) {
            try {
                $errorJson = $_.ErrorDetails.Message | ConvertFrom-Json
                Write-Host "   $($errorJson.error)" -ForegroundColor Red
            } catch {
                Write-Host "   $($_.ErrorDetails.Message)" -ForegroundColor Red
            }
        } else {
            Write-Host "   $($_.Exception.Message)" -ForegroundColor Red
        }
    } finally {
        if ($BSTR) {
            [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)
        }
    }
    
    exit
}

# Confirmation pour méthode directe (psql)
Write-Host "⚠️  Migration sur: dpg-d4b6c015pdvs73ck6rp0-a.frankfurt-postgres.render.com" -ForegroundColor Yellow
Write-Host "   Migration IDEMPOTENTE (peut être rejouée)`n" -ForegroundColor Cyan

$confirm = Read-Host "Continuer avec la migration directe ? (o/N)"

if ($confirm -ne 'o' -and $confirm -ne 'O') {
    Write-Host "❌ Annulation" -ForegroundColor Red
    exit 0
}

# Exécution
Write-Host "`n⏳ Migration en cours (10-30 secondes)...`n" -ForegroundColor Yellow

try {
    $output = & psql $DATABASE_URL -f $MIGRATION_FILE 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n╔═══════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
        Write-Host "║              ✅ MIGRATION RÉUSSIE !                              ║" -ForegroundColor Green
        Write-Host "╚═══════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Green
        
        Write-Host $output -ForegroundColor White
        
        Write-Host "`n✅ Testez maintenant: https://ymora.github.io/OTT/" -ForegroundColor Cyan
        Write-Host "✅ L'erreur 'Database error' devrait avoir disparu !`n" -ForegroundColor Green
        
    } else {
        Write-Host "`n❌ ERREUR:`n" -ForegroundColor Red
        Write-Host $output -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "`n❌ ERREUR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

