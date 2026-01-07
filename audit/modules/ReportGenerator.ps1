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
        Write-Host "Aucun contexte IA à exporter" -ForegroundColor Gray
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
        Version = "2.0"
        TotalQuestions = 0
        Categories = @{}
        # NOUVEAU: Prompts optimisés pour l'IA (format concis)
        OptimizedPrompts = @()
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
            
            # NOUVEAU: Générer des prompts optimisés (concis, peu de tokens)
            foreach ($q in $questions) {
                $prompt = switch ($q.Type) {
                    "Timer Without Cleanup" { 
                        "Timer $($q.File):$($q.Line) - cleanup nécessaire ? (Répondre OUI/NON + raison courte)"
                    }
                    "Unused Handler" {
                        "Handler '$($q.Handler)' dans $($q.File) - utilisé dynamiquement ? (OUI/NON)"
                    }
                    "SQL Injection Risk" {
                        "SQL $($q.File):$($q.Line) - injection possible ? (OUI/NON + fix si OUI)"
                    }
                    "LongFunction" {
                        "Fonction '$($q.Function)' ($($q.Lines) lignes) - refactoring suggéré ?"
                    }
                    "UnusedImport" {
                        "Import '$($q.Import)' dans $($q.File) - supprimer ? (OUI/NON)"
                    }
                    default {
                        "$($q.Type) - $($q.File):$($q.Line) - action requise ?"
                    }
                }
                
                $export.OptimizedPrompts += @{
                    Id = $export.OptimizedPrompts.Count + 1
                    Category = $category
                    Priority = $q.Severity
                    Prompt = $prompt
                    File = $q.File
                    Line = $q.Line
                }
            }
        }
    }
    
    # Générer un fichier de prompts texte simple (ultra-concis)
    $promptsFile = Join-Path $OutputDir "ai-prompts-$timestamp.txt"
    $promptsText = "# AUDIT IA - $(Get-Date -Format 'yyyy-MM-dd HH:mm')`n"
    $promptsText += "# $($export.TotalQuestions) questions à vérifier`n`n"
    
    $priorityOrder = @("critical", "high", "medium", "low", "warning")
    $sortedPrompts = $export.OptimizedPrompts | Sort-Object { $priorityOrder.IndexOf($_.Priority) }
    
    foreach ($p in $sortedPrompts) {
        $priorityIcon = switch ($p.Priority) {
            "critical" { "🔴" }
            "high" { "🟠" }
            "medium" { "🟡" }
            default { "⚪" }
        }
        $promptsText += "$priorityIcon [$($p.Id)] $($p.Prompt)`n"
    }
    
    $promptsText | Out-File -FilePath $promptsFile -Encoding UTF8 -Force
    
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
        
        # ================================================================
        # NOUVEAU: Mettre à jour AI-SUMMARY.md (point d'entrée unique IA)
        # ================================================================
        $summaryFile = Join-Path $OutputDir "AI-SUMMARY.md"
        $summaryContent = @"
# 🤖 RÉSUMÉ GLOBAL POUR L'IA
> **Point d'entrée unique** - Mis à jour: $(Get-Date -Format 'yyyy-MM-dd HH:mm')

---

## 📊 Dernier Audit
- **Date** : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
- **Questions IA** : $($export.TotalQuestions)
- **Fichier détaillé** : ``$($jsonFile | Split-Path -Leaf)``

---

## 🎯 QUESTIONS À VÉRIFIER (répondre OUI/NON + raison courte)

"@
        
        # Ajouter les prompts triés par priorité
        $priorityOrder = @("critical", "high", "medium", "low", "warning")
        $sortedPrompts = $export.OptimizedPrompts | Sort-Object { $priorityOrder.IndexOf($_.Priority) }
        
        foreach ($p in $sortedPrompts) {
            $icon = switch ($p.Priority) { "critical" {"🔴"} "high" {"🟠"} "medium" {"🟡"} default {"⚪"} }
            $summaryContent += "$icon **[$($p.Id)]** $($p.Prompt)`n"
        }
        
        $summaryContent += @"

---

## 📝 FORMAT DE RÉPONSE ATTENDU
``````
[1] OUI/NON - raison courte (max 10 mots)
[2] OUI/NON - raison courte
...
``````

---

## 📁 Fichiers de cet audit
- ``ai-context-$timestamp.json`` - Contexte complet
- ``ai-prompts-$timestamp.txt`` - Questions brutes
"@
        
        $summaryContent | Out-File -FilePath $summaryFile -Encoding UTF8 -Force
        Write-Host "   📋 Résumé IA : $summaryFile" -ForegroundColor Cyan
        
        return $jsonFile
    } catch {
        Write-Host "Erreur lors de l'export du contexte IA : $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

