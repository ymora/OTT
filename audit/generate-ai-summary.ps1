# ===============================================================================
# GENERE LE RESUME IA A PARTIR DU DERNIER AUDIT
# Usage: .\audit\generate-ai-summary.ps1
# ===============================================================================

param(
    [string]$ResultsDir = (Join-Path $PSScriptRoot "resultats")
)

Write-Host "[IA] Generation du resume IA..." -ForegroundColor Cyan

# Trouver le dernier fichier ai-context
$latestContext = Get-ChildItem -Path $ResultsDir -Filter "ai-context-*.json" -ErrorAction SilentlyContinue | 
    Sort-Object LastWriteTime -Descending | 
    Select-Object -First 1

if (-not $latestContext) {
    Write-Host "[ERR] Aucun fichier ai-context trouve. Lancez d'abord un audit complet." -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Fichier source: $($latestContext.Name)" -ForegroundColor Gray

# Lire le contexte
$context = Get-Content $latestContext.FullName -Raw | ConvertFrom-Json

# Generer le resume
$summaryFile = Join-Path $ResultsDir "AI-SUMMARY.md"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
$categories = $context.Categories.PSObject.Properties.Name -join ", "

$summary = "# RESUME GLOBAL POUR L'IA`n"
$summary += "> **Point d'entree unique** - Genere: $timestamp`n`n"
$summary += "---`n`n"
$summary += "## Dernier Audit`n"
$summary += "- **Source** : ``$($latestContext.Name)```n"
$summary += "- **Questions IA** : $($context.TotalQuestions)`n"
$summary += "- **Categories** : $categories`n`n"
$summary += "---`n`n"
$summary += "## QUESTIONS A VERIFIER`n`n"
$summary += "Repondre en format concis: ``[ID] OUI/NON - raison courte```n`n"

# Extraire et formater les questions
$questionId = 1
foreach ($categoryName in $context.Categories.PSObject.Properties.Name) {
    $category = $context.Categories.$categoryName
    
    if ($category.Questions) {
        $summary += "### $categoryName ($($category.QuestionCount) questions)`n`n"
        
        foreach ($q in $category.Questions) {
            $icon = switch ($q.Severity) { 
                "critical" { "[!!!]" } 
                "high" { "[!!]" } 
                "medium" { "[!]" } 
                default { "[ ]" } 
            }
            
            # Format concis
            $prompt = switch ($q.Type) {
                "Timer Without Cleanup" { "Timer $($q.File):$($q.Line) - cleanup necessaire ?" }
                "Unused Handler" { "Handler $($q.Handler) - utilise dynamiquement ?" }
                default { "$($q.Type) - $($q.File):$($q.Line)" }
            }
            
            $summary += "$icon **[$questionId]** $prompt`n"
            $questionId++
        }
        $summary += "`n"
    }
}

$summary += "---`n`n"
$summary += "## FORMAT DE REPONSE`n`n"
$summary += "```````n"
$summary += "[1] NON - timer dans handler, page reload apres`n"
$summary += "[2] OUI - SQL non parametre, utiliser prepare()`n"
$summary += "[3] NON - import utilise via props`n"
$summary += "```````n`n"
$summary += "---`n`n"
$summary += "## Pour plus de details`n"
$summary += "Voir le fichier complet: ``$($latestContext.Name)```n"

# Sauvegarder
$summary | Out-File -FilePath $summaryFile -Encoding UTF8 -Force

Write-Host "[OK] Resume genere: $summaryFile" -ForegroundColor Green
Write-Host ""
Write-Host "Contenu:" -ForegroundColor Cyan
Write-Host $summary
