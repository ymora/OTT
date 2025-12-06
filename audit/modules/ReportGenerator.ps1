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
    
    return $reportFile
}

