# ===============================================================================
# VÉRIFICATION : SUIVI TEMPS ET FACTURATION
# ===============================================================================
# Module de vérification du suivi du temps et de la facturation
# Vérifie : documentation, scripts, cohérence
# ===============================================================================

function Invoke-Check-TimeTracking {
    param(
        [Parameter(Mandatory=$true)]
        [hashtable]$Config,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Results
    )
    
    Write-PhaseSection -PhaseNumber 11 -Title "Suivi Temps et Facturation"
    
    $errors = @()
    $warnings = @()
    $success = @()
    
    # 1. Vérifier la documentation de suivi du temps
    Write-Host "`n[1] Verification documentation suivi temps" -ForegroundColor Yellow
    $timeTrackingDoc = "public/SUIVI_TEMPS_FACTURATION.md"
    if (Test-Path $timeTrackingDoc) {
        Write-OK "Documentation suivi temps presente: $timeTrackingDoc"
        $success += "Documentation suivi temps"
        
        # Vérifier le contenu
        $docContent = Get-Content $timeTrackingDoc -Raw
        if ($docContent -match "temps|facturation|billing|time.*tracking") {
            Write-OK "Documentation contient des informations sur le suivi du temps"
        } else {
            Write-Warn "Documentation peut etre incomplete"
            $warnings += "Documentation suivi temps peut etre incomplete"
        }
    } else {
        Write-Err "Documentation suivi temps manquante: $timeTrackingDoc"
        $errors += "Documentation suivi temps manquante"
    }
    
    # 2. Vérifier les scripts de génération de suivi
    Write-Host "`n[2] Verification scripts suivi temps" -ForegroundColor Yellow
    $timeTrackingScripts = @(
        "scripts/deploy/generate_time_tracking.sh"
    )
    
    foreach ($script in $timeTrackingScripts) {
        if (Test-Path $script) {
            Write-OK "Script trouve: $script"
            $success += "Script $script"
        } else {
            Write-Warn "Script manquant: $script (peut etre optionnel)"
            $warnings += "Script $script manquant"
        }
    }
    
    # 3. Vérifier la cohérence avec GitHub Pages
    Write-Host "`n[3] Verification integration GitHub Pages" -ForegroundColor Yellow
    if ($Config.GitHub -and $Config.GitHub.BaseUrl) {
        Write-OK "Configuration GitHub Pages presente"
        $success += "Configuration GitHub Pages"
    } else {
        Write-Warn "Configuration GitHub Pages non trouvee"
        $warnings += "Configuration GitHub Pages manquante"
    }
    
    # Calcul du score
    $totalChecks = $success.Count + $warnings.Count + $errors.Count
    if ($totalChecks -eq 0) {
        $score = 5
    } else {
        $score = [Math]::Round((($success.Count * 10) + ($warnings.Count * 5)) / $totalChecks, 1)
    }
    
    $Results.Scores["TimeTracking"] = $score
    
    # Résumé
    Write-Host "`n[RESUME] Resume Suivi Temps:" -ForegroundColor Cyan
    Write-Host "   [OK] Succes: $($success.Count)" -ForegroundColor Green
    Write-Host "   [WARN] Avertissements: $($warnings.Count)" -ForegroundColor Yellow
    Write-Host "   [ERR] Erreurs: $($errors.Count)" -ForegroundColor Red
    Write-Host "   [SCORE] Score: $score/10" -ForegroundColor Cyan
    
    return @{
        Success = $true
        Errors = $errors.Count
        Warnings = $warnings.Count
        Issues = $errors + $warnings
    }
}

