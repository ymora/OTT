# ===============================================================================
# GÉNÉRATION DES QUESTIONS POUR L'IA
# ===============================================================================

function Generate-AIQuestions {
    param(
        [Parameter(Mandatory=$true)]
        [array]$Issues,
        
        [Parameter(Mandatory=$true)]
        [array]$Warnings,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$ProjectInfo,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Config,
        
        [Parameter(Mandatory=$false)]
        [int]$MaxQuestions = 15,
        
        [Parameter(Mandatory=$false)]
        [string]$OutputDir = "audit"
    )
    
    if (-not $Config.AI.Enabled) {
        return $null
    }
    
    Write-Host "🤖 Génération des questions pour l'IA..." -ForegroundColor Cyan
    
    $questions = @()
    $questionCounter = 1
    
    # Créer le dossier de sortie
    if (-not (Test-Path $OutputDir)) {
        New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    }
    
    # Filtrer les issues/warnings selon les règles AI
    $itemsToAnalyze = @()
    
    foreach ($issue in $Issues) {
        $shouldAnalyze = $false
        
        foreach ($trigger in $Config.AI.AnalyzeWhen) {
            if ($trigger -eq "dead_code_detected" -and $issue.Type -eq "dead_code") {
                $shouldAnalyze = $true
                break
            }
            if ($trigger -eq "security_issue_found" -and $issue.Type -eq "security") {
                $shouldAnalyze = $true
                break
            }
            if ($trigger -eq "complex_code_detected" -and $issue.Type -eq "complexity") {
                $shouldAnalyze = $true
                break
            }
            if ($trigger -eq "duplication_found" -and $issue.Type -eq "code_duplication") {
                $shouldAnalyze = $true
                break
            }
        }
        
        if ($shouldAnalyze) {
            $itemsToAnalyze += @{
                Item = $issue
                Type = "issue"
            }
        }
    }
    
    # Limiter le nombre
    $itemsToAnalyze = $itemsToAnalyze | Select-Object -First $MaxQuestions
    
    # Générer les questions
    foreach ($item in $itemsToAnalyze) {
        $issue = $item.Item
        $question = Build-Question -Issue $issue -ProjectInfo $ProjectInfo -QuestionId "q$questionCounter"
        
        if ($question) {
            $questions += $question
            $questionCounter++
            Write-Info "  Question générée: $($issue.Type) - $($issue.File)"
        }
    }
    
    if ($questions.Count -eq 0) {
        Write-Host "  ⚠ Aucune question générée (aucun problème nécessitant analyse IA)" -ForegroundColor Yellow
        return $null
    }
    
    # Créer le fichier JSON
    $aiFile = @{
        timestamp = (Get-Date).ToUniversalTime().ToString("o")
        project_info = @{
            name = $ProjectInfo.Name
            type = $ProjectInfo.Type
            framework = $ProjectInfo.Framework
            path = (Resolve-Path ".").Path
        }
        instructions = @"
Ce fichier contient des questions pour l'IA concernant des problèmes détectés dans le code.
Pour chaque question, l'IA doit:
1. Analyser le code fourni
2. Comprendre le contexte du projet
3. Proposer une solution concrète avec code corrigé si applicable
4. Indiquer un niveau de confiance (0.0 à 1.0)
5. Recommander une action (delete, refactor, fix, ignore, manual_review)
"@
        questions = $questions
    }
    
    # Sauvegarder
    $outputFile = Join-Path $OutputDir "audit-ai.json"
    $jsonContent = $aiFile | ConvertTo-Json -Depth 10
    $jsonContent | Out-File -FilePath $outputFile -Encoding UTF8 -NoNewline
    
    Write-Host "  ✅ Fichier généré: $outputFile" -ForegroundColor Green
    Write-Host "   $($questions.Count) question(s) prêtes pour l'analyse IA" -ForegroundColor Green
    
    return $outputFile
}

function Build-Question {
    param(
        [hashtable]$Issue,
        [hashtable]$ProjectInfo,
        [string]$QuestionId
    )
    
    # Lire le code concerné
    $codeSnippet = $null
    $context = @{}
    
    if ($Issue.File -and (Test-Path $Issue.File)) {
        try {
            $fileContent = Get-Content $Issue.File -Raw -ErrorAction SilentlyContinue
            $lines = $fileContent -split "`n"
            
            $startLine = [Math]::Max(1, ($Issue.Line - 15))
            $endLine = [Math]::Min($lines.Count, ($Issue.Line + 15))
            
            if ($Issue.Line -eq 0) {
                $startLine = 1
                $endLine = [Math]::Min(50, $lines.Count)
            }
            
            $snippetLines = $lines[($startLine - 1)..($endLine - 1)]
            
            $codeSnippet = @{
                file = $Issue.File
                start_line = $startLine
                end_line = $endLine
                content = ($snippetLines -join "`n")
            }
            
            $context.file_exists = $true
            $context.total_lines = $lines.Count
        } catch {
            $context.error = $_.Exception.Message
        }
    }
    
    # Construire la question
    $question = @{
        id = $QuestionId
        type = $Issue.Type
        severity = $Issue.Severity
        file = $Issue.File
        line = $Issue.Line
        description = $Issue.Description
        question = Get-QuestionText -Issue $Issue -ProjectInfo $ProjectInfo
        code_snippet = $codeSnippet
        context = $context
    }
    
    # Ajouter des métadonnées spécifiques
    if ($Issue.Metrics) {
        $question.metrics = $Issue.Metrics
    }
    if ($Issue.SecurityRisk) {
        $question.security_risk = $Issue.SecurityRisk
        $question.vulnerability_type = $Issue.VulnerabilityType
    }
    
    return $question
}

function Get-QuestionText {
    param(
        [hashtable]$Issue,
        [hashtable]$ProjectInfo
    )
    
    $base = "Analyse ce problème de code et propose une solution concrète."
    
    switch ($Issue.Type) {
        "dead_code" {
            return @"
Ce fichier '$($Issue.File)' n'est utilisé/importé nulle part dans le projet.
- Dois-je le supprimer ou est-il prévu pour un usage futur ?
- Y a-t-il un équivalent/remplacement dans le code ?
- Analyse le code et recommande une action (supprimer, garder avec documentation, refactorer).

Projet: $($ProjectInfo.Type) / $($ProjectInfo.Framework)
"@
        }
        
        "code_duplication" {
            return @"
Code dupliqué détecté: $($Issue.Description)
- Identifie les différences subtiles
- Propose une fonction/hook/composant réutilisable
- Génère le code refactorisé

Projet: $($ProjectInfo.Type) / $($ProjectInfo.Framework)
"@
        }
        
        "security" {
            return @"
Problème de sécurité détecté : $($Issue.Description)
- Analyse le risque exact
- Évalue la criticité (critique, élevé, moyen, faible)
- Propose le code corrigé avec explications

Projet: $($ProjectInfo.Type) / $($ProjectInfo.Framework)
"@
        }
        
        "complexity" {
            return @"
Fichier/fonction très complexe: $($Issue.Description)
- Analyse la complexité
- Propose une refactorisation en plusieurs fonctions/composants plus petits
- Génère le code refactorisé

Projet: $($ProjectInfo.Type) / $($ProjectInfo.Framework)
"@
        }
        
        default {
            return "$base`n`nProblème: $($Issue.Description)`nProjet: $($ProjectInfo.Type) / $($ProjectInfo.Framework)"
        }
    }
}

