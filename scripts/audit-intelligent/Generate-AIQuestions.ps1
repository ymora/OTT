# ===============================================================================
# Génération des Questions pour l'IA
# ===============================================================================
# Ce script génère un fichier audit-ai.json avec les questions à poser à l'IA
# L'IA (Cursor) peut ensuite lire ce fichier et générer audit-ai-resp.json
# ===============================================================================

function Generate-AIQuestions {
    param(
        [Parameter(Mandatory=$true)]
        [array]$Issues,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$ProjectInfo,
        
        [Parameter(Mandatory=$false)]
        [string]$OutputFile = "audit-ai.json",
        
        [Parameter(Mandatory=$false)]
        [int]$MaxQuestions = 10
    )
    
    Write-Host "`n🤖 Génération des questions pour l'IA..." -ForegroundColor Cyan
    
    $questions = @()
    $questionsAdded = 0
    
    foreach ($issue in $Issues) {
        if ($questionsAdded -ge $MaxQuestions) {
            break
        }
        
        # Construire la question selon le type
        $question = Build-Question -Issue $issue -ProjectInfo $ProjectInfo
        
        if ($question) {
            $questions += $question
            $questionsAdded++
            Write-Host "  ✓ Question générée: $($issue.Type) - $($issue.File)" -ForegroundColor Gray
        }
    }
    
    if ($questions.Count -eq 0) {
        Write-Host "  ⚠ Aucune question générée" -ForegroundColor Yellow
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
    $jsonContent = $aiFile | ConvertTo-Json -Depth 10
    $jsonContent | Out-File -FilePath $OutputFile -Encoding UTF8 -NoNewline
    
    Write-Host "`n✅ Fichier généré: $OutputFile" -ForegroundColor Green
    Write-Host "   $($questions.Count) question(s) prêtes pour l'analyse IA" -ForegroundColor Green
    Write-Host ""
    Write-Host "📝 PROCHAINES ÉTAPES:" -ForegroundColor Yellow
    Write-Host "   1. Ouvrez Cursor" -ForegroundColor White
    Write-Host "   2. Dites: 'L'audit a créé audit-ai.json. Analyse-le et réponds.'" -ForegroundColor White
    Write-Host "   3. L'IA va générer audit-ai-resp.json avec les réponses" -ForegroundColor White
    Write-Host ""
    
    return $OutputFile
}

function Build-Question {
    param(
        [Parameter(Mandatory=$true)]
        [hashtable]$Issue,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$ProjectInfo
    )
    
    $questionId = "q$($script:questionCounter++)"
    if (-not $script:questionCounter) { $script:questionCounter = 1 }
    
    # Lire le code concerné
    $codeSnippet = $null
    $context = @{}
    
    if ($Issue.File -and (Test-Path $Issue.File)) {
        try {
            $fileContent = Get-Content $Issue.File -Raw -ErrorAction SilentlyContinue
            $lines = $fileContent -split "`n"
            
            $startLine = [Math]::Max(1, ($Issue.Line - 15))
            $endLine = [Math]::Min($lines.Count, ($Issue.Line + 15))
            
            $snippetLines = $lines[($startLine - 1)..($endLine - 1)]
            
            $codeSnippet = @{
                file = $Issue.File
                start_line = $startLine
                end_line = $endLine
                content = ($snippetLines -join "`n")
            }
            
            # Ajouter contexte supplémentaire
            $context.file_exists = $true
            $context.file_size = (Get-Item $Issue.File).Length
            $context.total_lines = $lines.Count
        } catch {
            $context.error = $_.Exception.Message
        }
    }
    
    # Construire la question selon le type
    $question = @{
        id = $questionId
        type = $Issue.Type
        severity = $Issue.Severity
        file = $Issue.File
        line = $Issue.Line
        description = $Issue.Description
        question = Get-QuestionText -Issue $Issue -ProjectInfo $ProjectInfo
        code_snippet = $codeSnippet
        context = $context
    }
    
    # Ajouter des infos spécifiques selon le type
    switch ($Issue.Type) {
        "dead_code" {
            $question.context.imports_found = $Issue.Imports -or @()
            $question.context.usage_count = $Issue.UsageCount -or 0
        }
        "code_duplication" {
            $question.duplicated_files = $Issue.DuplicatedFiles -or @()
            $question.similarity_score = $Issue.SimilarityScore -or 0
        }
        "security" {
            $question.security_risk = $Issue.SecurityRisk -or "unknown"
            $question.vulnerability_type = $Issue.VulnerabilityType -or "unknown"
        }
    }
    
    return $question
}

function Get-QuestionText {
    param(
        [hashtable]$Issue,
        [hashtable]$ProjectInfo
    )
    
    $baseQuestion = "Analyse ce problème de code et propose une solution concrète."
    
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
Code dupliqué détecté. Analyse la duplication entre ces fichiers et propose un refactoring pour unifier le code.
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
Ce fichier/fonction est très complexe ($($Issue.Metrics.Lines) lignes, complexité cyclomatique: $($Issue.Metrics.Complexity)).
- Analyse la complexité
- Propose une refactorisation en plusieurs fonctions/composants plus petits
- Génère le code refactorisé

Projet: $($ProjectInfo.Type) / $($ProjectInfo.Framework)
"@
        }
        
        "performance" {
            return @"
Problème de performance détecté : $($Issue.Description)
- Analyse l'impact sur les performances
- Propose des optimisations concrètes
- Génère le code optimisé

Projet: $($ProjectInfo.Type) / $($ProjectInfo.Framework)
"@
        }
        
        default {
            return "$baseQuestion`n`nProblème: $($Issue.Description)`nProjet: $($ProjectInfo.Type) / $($ProjectInfo.Framework)"
        }
    }
}

# Initialiser le compteur
$script:questionCounter = 1

Export-ModuleMember -Function Generate-AIQuestions

