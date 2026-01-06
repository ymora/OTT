# ===============================================================================
# VÉRIFICATION : SUIVI TEMPS ET FACTURATION
# ===============================================================================
# Module de vérification du suivi du temps et de la facturation
# Vérifie : documentation, scripts, cohérence
# Génère : statistiques par contributeur (utilisateur)
# ===============================================================================

function Get-GitContributorStats {
    param(
        [int]$Days = 365
    )
    
    $stats = @{
        Authors = @()
        TotalCommits = 0
        Period = $Days
    }
    
    try {
        $sinceDate = (Get-Date).AddDays(-$Days).ToString("yyyy-MM-dd")
        $gitLogFormat = "%H|%an|%ae|%ci|%s"
        $commits = & git log --all --since="$sinceDate" --format="$gitLogFormat" 2>$null
        
        if (-not $commits) { return $stats }
        
        $authorData = @{}
        
        foreach ($line in $commits) {
            if ([string]::IsNullOrWhiteSpace($line)) { continue }
            
            $parts = $line -split '\|', 5
            if ($parts.Count -lt 5) { continue }
            
            $author = $parts[1].Trim()
            $email = $parts[2].Trim()
            $dateStr = $parts[3].Substring(0, 10)
            $message = $parts[4]
            
            if (-not $authorData.ContainsKey($author)) {
                $authorData[$author] = @{
                    Name = $author
                    Email = $email
                    TotalCommits = 0
                    DaysActive = @{}
                    Categories = @{ Feature = 0; Fix = 0; Refactor = 0; Doc = 0; Test = 0; UI = 0; Deploy = 0; Other = 0 }
                }
            }
            
            $authorData[$author].TotalCommits++
            $authorData[$author].DaysActive[$dateStr] = $true
            $stats.TotalCommits++
            
            # Catégorisation
            $msg = $message.ToLower()
            if ($msg -match "feat|feature|add|ajout|nouveau") { $authorData[$author].Categories.Feature++ }
            elseif ($msg -match "fix|bug|corr|repair") { $authorData[$author].Categories.Fix++ }
            elseif ($msg -match "refact|clean|amélio|optim") { $authorData[$author].Categories.Refactor++ }
            elseif ($msg -match "doc|readme|comment") { $authorData[$author].Categories.Doc++ }
            elseif ($msg -match "test|spec|jest") { $authorData[$author].Categories.Test++ }
            elseif ($msg -match "ui|css|style|design") { $authorData[$author].Categories.UI++ }
            elseif ($msg -match "deploy|release|version") { $authorData[$author].Categories.Deploy++ }
            else { $authorData[$author].Categories.Other++ }
        }
        
        # Convertir en liste triée
        foreach ($author in $authorData.Keys | Sort-Object { $authorData[$_].TotalCommits } -Descending) {
            $data = $authorData[$author]
            $contribution = if ($stats.TotalCommits -gt 0) { [Math]::Round(($data.TotalCommits / $stats.TotalCommits) * 100, 1) } else { 0 }
            $estimatedHours = [Math]::Round($data.TotalCommits * 0.5, 1)
            
            $stats.Authors += @{
                Name = $data.Name
                Email = $data.Email
                TotalCommits = $data.TotalCommits
                DaysActive = $data.DaysActive.Keys.Count
                EstimatedHours = $estimatedHours
                Contribution = $contribution
                Categories = $data.Categories
            }
        }
    }
    catch {
        Write-Host "   Erreur lors de l'analyse Git: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    return $stats
}

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
        "scripts/deploy/generate_time_tracking.sh",
        "scripts/Generate-GitStats.ps1"
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
    
    # 3. NOUVEAU : Générer les statistiques par contributeur
    Write-Host "`n[3] Statistiques Git par contributeur" -ForegroundColor Yellow
    $gitStats = Get-GitContributorStats -Days 365
    
    if ($gitStats.Authors.Count -gt 0) {
        Write-OK "Analyse Git reussie: $($gitStats.TotalCommits) commits, $($gitStats.Authors.Count) contributeurs"
        $success += "Analyse Git"
        
        Write-Host "`n   ┌─────────────────────────────────────────────────────────────────┐" -ForegroundColor Cyan
        Write-Host "   │            STATISTIQUES PAR CONTRIBUTEUR                         │" -ForegroundColor Cyan
        Write-Host "   ├─────────────────────────────────────────────────────────────────┤" -ForegroundColor Cyan
        Write-Host "   │ Contributeur          │ Commits │   %   │ Heures │ Jours actifs │" -ForegroundColor Cyan
        Write-Host "   ├─────────────────────────────────────────────────────────────────┤" -ForegroundColor Cyan
        
        foreach ($author in $gitStats.Authors) {
            $name = $author.Name.PadRight(20).Substring(0, 20)
            $commits = $author.TotalCommits.ToString().PadLeft(7)
            $pct = "$($author.Contribution)%".PadLeft(6)
            $hours = "~$($author.EstimatedHours)h".PadLeft(7)
            $days = $author.DaysActive.ToString().PadLeft(12)
            Write-Host "   │ $name │$commits │$pct │$hours │$days │" -ForegroundColor White
        }
        
        Write-Host "   └─────────────────────────────────────────────────────────────────┘" -ForegroundColor Cyan
        
        # Détail par contributeur
        Write-Host "`n   Detail par type de travail:" -ForegroundColor Yellow
        foreach ($author in $gitStats.Authors) {
            Write-Host "   ▸ $($author.Name):" -ForegroundColor Cyan
            $cats = $author.Categories
            Write-Host "     Features: $($cats.Feature) | Fix: $($cats.Fix) | Refactor: $($cats.Refactor) | Doc: $($cats.Doc) | Tests: $($cats.Test) | UI: $($cats.UI)" -ForegroundColor Gray
        }
        
        # Stocker dans les résultats
        $Results.Statistics["GitContributors"] = $gitStats
        
    } else {
        Write-Warn "Aucun commit trouve ou Git non disponible"
        $warnings += "Analyse Git non disponible"
    }
    
    # 4. Vérifier la cohérence avec GitHub Pages
    Write-Host "`n[4] Verification integration GitHub Pages" -ForegroundColor Yellow
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
    
    if ($gitStats.Authors.Count -gt 0) {
        Write-Host "`n   [GIT] Contributeurs: $($gitStats.Authors.Count) | Total commits: $($gitStats.TotalCommits)" -ForegroundColor Magenta
    }
    
    return @{
        Success = $true
        Errors = $errors.Count
        Warnings = $warnings.Count
        Issues = $errors + $warnings
        GitStats = $gitStats
    }
}

