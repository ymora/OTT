# ===============================================================================
# INTÉGRATION DES RÉPONSES IA
# ===============================================================================

function Integrate-AIResponses {
    param(
        [Parameter(Mandatory=$true)]
        [string]$ResponseFile,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Results
    )
    
    if (-not (Test-Path $ResponseFile)) {
        Write-Warn "Fichier de réponse IA introuvable: $ResponseFile"
        return
    }
    
    try {
        $responseContent = Get-Content $ResponseFile -Raw | ConvertFrom-Json
        
        if (-not $responseContent.answers) {
            Write-Warn "Aucune réponse trouvée dans le fichier IA"
            return
        }
        
        Write-Host "  Intégration de $($responseContent.answers.Count) réponse(s) IA..." -ForegroundColor Gray
        
        # Créer un index des issues par question ID depuis audit-ai.json
        $aiQuestionsFile = Join-Path (Split-Path $ResponseFile -Parent) "audit-ai.json"
        $questionMap = @{}
        
        if (Test-Path $aiQuestionsFile) {
            try {
                $questionsContent = Get-Content $aiQuestionsFile -Raw | ConvertFrom-Json
                foreach ($q in $questionsContent.questions) {
                    $questionMap[$q.id] = @{
                        File = $q.file
                        Type = $q.type
                        Line = $q.line
                    }
                }
            } catch {
                Write-Warn "Impossible de lire audit-ai.json: $($_.Exception.Message)"
            }
        }
        
        foreach ($answer in $responseContent.answers) {
            # Trouver l'issue correspondante
            $matchedIssue = $null
            $issueIndex = -1
            
            if ($questionMap.ContainsKey($answer.id)) {
                $questionInfo = $questionMap[$answer.id]
                # Chercher par fichier et type
                for ($i = 0; $i -lt $Results.Issues.Count; $i++) {
                    $issue = $Results.Issues[$i]
                    if ($issue -is [hashtable]) {
                        if ($issue.File -eq $questionInfo.File -and $issue.Type -eq $questionInfo.Type) {
                            $matchedIssue = $issue
                            $issueIndex = $i
                            break
                        }
                    }
                }
            }
            
            if ($matchedIssue -and $issueIndex -ge 0) {
                # Ajouter les informations IA à l'issue
                $Results.Issues[$issueIndex].AIAnalysis = $answer.analysis
                $Results.Issues[$issueIndex].AIRecommendation = $answer.recommendation
                $Results.Issues[$issueIndex].AIConfidence = $answer.confidence
                if ($answer.suggested_fix) {
                    $Results.Issues[$issueIndex].AISuggestedFix = $answer.suggested_fix
                }
                $Results.Issues[$issueIndex].AIAction = $answer.action
                
                Write-Info "    ✓ $($answer.id): $($answer.recommendation) (confiance: $($answer.confidence))"
            } else {
                Write-Warn "    ⚠ Issue non trouvée pour la réponse $($answer.id)"
            }
        }
        
        Write-Host "  ✅ Réponses IA intégrées" -ForegroundColor Green
    } catch {
        Write-Err "Erreur intégration réponses IA: $($_.Exception.Message)"
    }
}

