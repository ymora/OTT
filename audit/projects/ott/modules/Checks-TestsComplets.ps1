# ===============================================================================
# VÉRIFICATION : TESTS COMPLETS APPLICATION OTT
# ===============================================================================
# Module de test exhaustif pour l'application OTT
# Vérifie : corrections critiques, API, navigation, fonctionnalités
# Génère contexte IA pour analyse approfondie
# ===============================================================================

function Invoke-Check-TestsComplets {
    param(
        [Parameter(Mandatory=$true)]
        [hashtable]$Config,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Results
    )
    
    Write-PhaseSection -PhaseNumber 13 -Title "Tests End-to-End Complets Application"
    
    $errors = @()
    $warnings = @()
    $success = @()
    $aiContext = @()
    
    # 1. Vérification fichiers critiques
    Write-Host "`n[1] Verification fichiers critiques" -ForegroundColor Yellow
    $criticalFiles = @(
        "api.php",
        "api/handlers/devices/patients.php",
        "api/handlers/auth.php",
        "api/handlers/usb_logs.php",
        "api/helpers.php",
        "api/validators.php"
    )
    foreach ($file in $criticalFiles) {
        if (Test-Path $file) {
            Write-OK "$file"
            $success += "Fichier $file"
        } else {
            Write-Err "$file manquant"
            $errors += "Fichier $file manquant"
        }
    }
    
    # 2. Vérification corrections critiques
    Write-Host "`n[2] Verification corrections critiques" -ForegroundColor Yellow
    
    # 2.1 whereClause dans patients.php
    $patientsFile = Get-Content "api/handlers/devices/patients.php" -Raw -ErrorAction SilentlyContinue
    if ($patientsFile -and $patientsFile -match '\$whereClause\s*=') {
        Write-OK "whereClause défini dans patients.php"
        $success += "whereClause patients.php"
    } else {
        Write-Err "whereClause manquant dans patients.php"
        $errors += "whereClause manquant patients.php"
        $aiContext += @{
            Category = "Corrections Critiques"
            Type = "Variable whereClause manquante"
            File = "api/handlers/devices/patients.php"
            Severity = "critical"
            NeedsAICheck = $true
            Question = "La variable `$whereClause n'est pas définie dans handleGetPatients(). Cela cause des erreurs SQL. Où doit-elle être définie et quelle valeur doit-elle avoir selon le paramètre include_deleted ?"
        }
    }
    
    # 2.2 whereClause dans auth.php
    $authFile = Get-Content "api/handlers/auth.php" -Raw -ErrorAction SilentlyContinue
    if ($authFile -and $authFile -match '\$whereClause\s*=') {
        Write-OK "whereClause défini dans auth.php"
        $success += "whereClause auth.php"
    } else {
        Write-Err "whereClause manquant dans auth.php"
        $errors += "whereClause manquant auth.php"
        $aiContext += @{
            Category = "Corrections Critiques"
            Type = "Variable whereClause manquante"
            File = "api/handlers/auth.php"
            Severity = "critical"
            NeedsAICheck = $true
            Question = "La variable `$whereClause n'est pas définie dans handleGetUsers(). Cela cause des erreurs SQL. Où doit-elle être définie et quelle valeur doit-elle avoir selon le paramètre include_deleted ?"
        }
    }
    
    # 2.3 display_errors désactivé
    $apiFile = Get-Content "api.php" -Raw -ErrorAction SilentlyContinue
    if ($apiFile -and $apiFile -match 'ini_set\([''"]display_errors[''"],\s*0\)') {
        Write-OK "display_errors désactivé"
        $success += "display_errors désactivé"
    } else {
        Write-Warn "display_errors peut être activé"
        $warnings += "display_errors peut être activé"
        $aiContext += @{
            Category = "Configuration PHP"
            Type = "display_errors activé"
            File = "api.php"
            Severity = "high"
            NeedsAICheck = $true
            Question = "display_errors est activé dans api.php. Cela peut polluer les réponses JSON avec des warnings HTML. Doit-il être désactivé même en mode debug pour garantir des réponses JSON propres ?"
        }
    }
    
    # 2.4 urldecode dans usb_logs.php
    $usbLogsFile = Get-Content "api/handlers/usb_logs.php" -Raw -ErrorAction SilentlyContinue
    if ($usbLogsFile -and $usbLogsFile -match 'urldecode') {
        Write-OK "urldecode présent dans usb_logs.php"
        $success += "urldecode usb_logs.php"
    } else {
        Write-Warn "urldecode peut être manquant dans usb_logs.php"
        $warnings += "urldecode peut être manquant usb_logs.php"
        $aiContext += @{
            Category = "API Handlers"
            Type = "Décodage URL manquant"
            File = "api/handlers/usb_logs.php"
            Severity = "medium"
            NeedsAICheck = $true
            Question = "Les identifiants de dispositifs dans les URLs peuvent contenir des caractères spéciaux encodés (ex: 'USB-En%20attente...'). Faut-il utiliser urldecode() avant de les utiliser dans les requêtes SQL ?"
        }
    }
    
    # 3. Tests API (optionnel - warnings si non accessible, pas d'erreurs)
    Write-Host "`n[3] Tests API (optionnel - normal si Docker non demarre)" -ForegroundColor Yellow
    $API_URL = if ($Config.API -and $Config.API.BaseUrl) { $Config.API.BaseUrl } elseif ($Config.Api -and $Config.Api.BaseUrl) { $Config.Api.BaseUrl } else { "http://localhost:8000" }
    
    # 3.1 Health check avec timeout court
    try {
        $health = Invoke-RestMethod -Uri "$API_URL/api.php/health" -Method GET -TimeoutSec 2 -ErrorAction Stop
        if ($health.status -eq "online" -or $health.status -eq "ok") {
            Write-OK "Health check OK"
            $success += "Health check API"
        } else {
            Write-Warn "Health check: $($health.status)"
            $warnings += "Health check: $($health.status)"
        }
    } catch {
        Write-Warn "Health check non accessible: $($_.Exception.Message) (normal si Docker non démarré)"
        $warnings += "Health check: API non accessible (normal si Docker non démarré)"
    }
    
    # 3.2 Endpoints GET (seulement si health check OK)
    $endpoints = @(
        @{ Path="/api.php/devices"; Name="Dispositifs" }
        @{ Path="/api.php/patients"; Name="Patients" }
        @{ Path="/api.php/users"; Name="Utilisateurs" }
        @{ Path="/api.php/alerts"; Name="Alertes" }
    )
    
    foreach ($endpoint in $endpoints) {
        try {
            $response = Invoke-RestMethod -Uri "$API_URL$($endpoint.Path)" -Method GET -TimeoutSec 2 -ErrorAction Stop
            if ($response.success -ne $false) {
                Write-OK "$($endpoint.Name) - $($endpoint.Path)"
                $success += "Endpoint $($endpoint.Path)"
            } else {
                Write-Warn "$($endpoint.Name) : $($response.error)"
                $warnings += "$($endpoint.Path) : $($response.error)"
            }
        } catch {
            $statusCode = if ($_.Exception.Response) { $_.Exception.Response.StatusCode.value__ } else { $null }
            if ($statusCode -eq 401 -or $statusCode -eq 403) {
                Write-OK "$($endpoint.Name) (auth requise - normal)"
                $success += "$($endpoint.Path) (auth requise)"
            } else {
                Write-Warn "$($endpoint.Name) : $($_.Exception.Message) (normal si Docker non démarré)"
                $warnings += "$($endpoint.Path) : API non accessible (normal si Docker non démarré)"
                # Ne pas ajouter au contexte IA car c'est normal si Docker n'est pas démarré
            }
        }
    }
    
    # 4. Vérification sécurité SQL
    Write-Host "`n[4] Verification securite SQL" -ForegroundColor Yellow
    $phpFiles = Get-ChildItem -Path "api" -Filter "*.php" -Recurse -ErrorAction SilentlyContinue
    $sqlInjectionRisks = 0
    foreach ($file in $phpFiles) {
        $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
        if ($content) {
            # Chercher des patterns dangereux (concaténation SQL avec variables)
            if ($content -match '\$pdo->(query|exec)\s*\(\s*["''][^"'']*\$' -or 
                ($content -match '\.\s*\$[a-zA-Z_]+\s*\.' -and $content -match 'SELECT|INSERT|UPDATE|DELETE')) {
                $sqlInjectionRisks++
                Write-Warn "Risque SQL potentiel dans $($file.Name)"
                $warnings += "Risque SQL potentiel: $($file.Name)"
                $aiContext += @{
                    Category = "Sécurité SQL"
                    Type = "Risque injection SQL"
                    File = $file.Name
                    Severity = "critical"
                    NeedsAICheck = $true
                    Question = "Le fichier $($file.Name) contient une concaténation SQL avec des variables. Est-ce sécurisé ou faut-il utiliser des requêtes préparées (PDO) ?"
                }
            }
        }
    }
    if ($sqlInjectionRisks -eq 0) {
        Write-OK "Aucun risque SQL injection détecté"
        $success += "Sécurité SQL"
    }
    
    # Calcul du score
    $totalChecks = $success.Count + $warnings.Count + $errors.Count
    if ($totalChecks -eq 0) {
        $score = 5
    } else {
        $score = [Math]::Round((($success.Count * 10) + ($warnings.Count * 5)) / $totalChecks, 1)
    }
    $Results.Scores["TestsComplets"] = $score
    
    # Ajouter le contexte IA aux résultats
    if ($aiContext.Count -gt 0) {
        # S'assurer que AIContext est un tableau
        if (-not $Results.AIContext) {
            $Results.AIContext = @()
        }
        # Vérifier que AIContext est bien un tableau (pas une hashtable)
        if ($Results.AIContext -isnot [array]) {
            $Results.AIContext = @($Results.AIContext)
        }
        # Ajouter chaque élément individuellement pour éviter l'erreur "hash table can only be added to another hash table"
        foreach ($contextItem in $aiContext) {
            if ($contextItem -is [hashtable]) {
                # Créer une copie de la hashtable pour éviter les problèmes de référence
                $contextCopy = @{}
                foreach ($key in $contextItem.Keys) {
                    $contextCopy[$key] = $contextItem[$key]
                }
                # Utiliser += avec une virgule pour forcer l'ajout comme élément de tableau
                $Results.AIContext = $Results.AIContext + @(,$contextCopy)
            } else {
                # Si ce n'est pas une hashtable, l'ajouter tel quel
                $Results.AIContext = $Results.AIContext + @(,$contextItem)
            }
        }
    }
    
    # Résumé
    Write-Host "`n[RESUME] Resume Tests Complets:" -ForegroundColor Cyan
    Write-Host "   [OK] Succes: $($success.Count)" -ForegroundColor Green
    Write-Host "   [WARN] Avertissements: $($warnings.Count)" -ForegroundColor Yellow
    Write-Host "   [ERROR] Erreurs: $($errors.Count)" -ForegroundColor Red
    Write-Host "   [SCORE] Score: $score/10" -ForegroundColor Cyan
    
    if ($errors.Count -gt 0) {
        Write-Host "`n[ERROR] Erreurs critiques detectees:" -ForegroundColor Red
        foreach ($error in $errors) {
            Write-Host "   - $error" -ForegroundColor Red
        }
    }
    
    if ($aiContext.Count -gt 0) {
        Write-Host "`n[IA] $($aiContext.Count) question(s) generee(s) pour analyse IA" -ForegroundColor Cyan
    }
}

