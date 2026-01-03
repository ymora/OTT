# ===============================================================================
# GÉNÉRATEUR DE RAPPORT
# ===============================================================================

function Generate-Report {
    param(
        [Parameter(Mandatory=$true)]
        [hashtable]$Results,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Config,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$ProjectInfo,
        
        [Parameter(Mandatory=$false)]
        [string]$OutputDir = "audit/reports"
    )
    
    # Créer le dossier
    if (-not (Test-Path $OutputDir)) {
        New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    }
    
    $timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
    $reportFile = Join-Path $OutputDir "audit-report-$timestamp.md"
    
    $duration = ((Get-Date) - $Results.StartTime).TotalSeconds
    $globalScore = Calculate-GlobalScore -Results $Results -Config $Config
    
    # Générer le rapport Markdown
    $report = @"
# Rapport d'Audit - $($ProjectInfo.Name)

**Date** : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  
**Projet** : $($ProjectInfo.Name)  
**Type** : $($ProjectInfo.Type) / $($ProjectInfo.Framework)  
**Durée** : $([Math]::Round($duration, 1))s  
**Score Global** : **$globalScore/10**

---

## 📊 Résumé Exécutif

- **Problèmes** : $($Results.Issues.Count)
- **Avertissements** : $($Results.Warnings.Count)
- **Recommandations** : $($Results.Recommendations.Count)

---

## 🎯 Scores par Catégorie

"@

    foreach ($key in ($Results.Scores.Keys | Sort-Object)) {
        $score = $Results.Scores[$key]
        $emoji = if($score -ge 9){"✅"}elseif($score -ge 7){"⚠️"}else{"❌"}
        $report += "`n- **$key** : $score/10 $emoji"
    }

    $report += @"

---

## ❌ Problèmes Critiques

"@

    if ($Results.Issues.Count -eq 0) {
        $report += "`n✅ Aucun problème critique détecté."
    } else {
        foreach ($issue in $Results.Issues) {
            if ($issue -is [hashtable]) {
                $report += "`n- **$($issue.Type)** : $($issue.Description)  `n  - Fichier: $($issue.File)"
            } else {
                $report += "`n- $issue"
            }
        }
    }

    $report += @"

---

## ⚠️ Avertissements

"@

    if ($Results.Warnings.Count -eq 0) {
        $report += "`n✅ Aucun avertissement."
    } else {
        foreach ($warn in $Results.Warnings) {
            $report += "`n- $warn"
        }
    }

    $report += @"

---

## 💡 Recommandations

"@

    if ($Results.Recommendations.Count -eq 0) {
        $report += "`n✅ Aucune recommandation."
    } else {
        foreach ($rec in $Results.Recommendations) {
            $report += "`n- $rec"
        }
    }

    $report += @"

---

## 📈 Statistiques

"@

    if ($Results.Stats) {
        foreach ($key in $Results.Stats.Keys) {
            $value = $Results.Stats[$key]
            $report += "`n- **$key** : $value"
        }
    }

    $report += "`n`n---`n`n## 🤖 Analyse IA`n`n"

    $aiIssues = $Results.Issues | Where-Object {
        if ($_ -is [hashtable]) {
            $_.ContainsKey("AIAnalysis")
        } else {
            $false
        }
    }

    if ($aiIssues.Count -eq 0) {
        $report += "`n*Analyse IA non disponible.*"
    } else {
        foreach ($issue in $aiIssues) {
            $report += "`n`n### $($issue.Description)`n`n"
            $report += "**Analyse** : $($issue.AIAnalysis)`n`n"
            $report += "**Recommandation** : $($issue.AIRecommendation) (confiance: $($issue.AIConfidence))`n`n"
            $report += "**Action** : $($issue.AIAction)`n"
        }
    }

    $report += "`n`n---`n`n*Rapport généré automatiquement par Audit Intelligent Automatique*"

    # Sauvegarder
    $report | Out-File -FilePath $reportFile -Encoding UTF8
    
    Write-Host "`n📄 Rapport généré : $reportFile" -ForegroundColor Green
    return $reportFile
}

# ===============================================================================
# EXPORT AICONTEXT POUR L'IA
# ===============================================================================

function Export-AIContext {
    param(
        [Parameter(Mandatory=$true)]
        [hashtable]$Results,
        
        [Parameter(Mandatory=$false)]
        [string]$OutputDir = "audit/reports"
    )
    
    # Vérifier si AIContext existe
    if (-not $Results.AIContext -or $Results.AIContext.Count -eq 0) {
        Write-Info "Aucun contexte IA à exporter"
        return $null
    }
    
    # Créer le dossier
    if (-not (Test-Path $OutputDir)) {
        New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    }
    
    $timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
    $jsonFile = Join-Path $OutputDir "ai-context-$timestamp.json"
    
    # Préparer l'export structuré
    $export = @{
        Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        Version = "1.0"
        TotalQuestions = 0
        Categories = @{}
    }
    
    # Parcourir toutes les catégories dans AIContext
    foreach ($category in $Results.AIContext.Keys) {
        $categoryData = $Results.AIContext[$category]
        
        if ($categoryData -and $categoryData.Questions) {
            $questions = $categoryData.Questions
            $export.TotalQuestions += $questions.Count
            
            $export.Categories[$category] = @{
                QuestionCount = $questions.Count
                Questions = $questions
                Summary = @{
                    Critical = ($questions | Where-Object { $_.Severity -eq "critical" }).Count
                    High = ($questions | Where-Object { $_.Severity -eq "high" }).Count
                    Medium = ($questions | Where-Object { $_.Severity -eq "medium" }).Count
                    Low = ($questions | Where-Object { $_.Severity -eq "low" }).Count
                }
            }
        }
    }
    
    # Exporter en JSON
    try {
        $export | ConvertTo-Json -Depth 10 | Out-File -FilePath $jsonFile -Encoding UTF8 -Force
        Write-Host "`n🤖 Contexte IA exporté : $jsonFile" -ForegroundColor Cyan
        Write-Host "   Total questions : $($export.TotalQuestions)" -ForegroundColor Gray
        
        # Afficher le résumé par catégorie
        foreach ($category in $export.Categories.Keys) {
            $catData = $export.Categories[$category]
            Write-Host "   - $category : $($catData.QuestionCount) question(s)" -ForegroundColor Gray
        }
        
        return $jsonFile
    } catch {
        Write-Err "Erreur lors de l'export du contexte IA : $($_.Exception.Message)"
        return $null
    }
}

