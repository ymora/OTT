# ===============================================================================
# GÉNÉRATEUR DE CONTEXTE POUR L'IA
# ===============================================================================
# Génère un rapport structuré avec contexte pour que l'IA vérifie efficacement
# les cas douteux identifiés par l'audit CPU

function Generate-AIContext {
    param(
        [Parameter(Mandatory=$true)]
        [hashtable]$Results,
        
        [Parameter(Mandatory=$true)]
        [string]$ProjectPath,
        
        [Parameter(Mandatory=$false)]
        [string]$OutputFile = ""
    )
    
    $aiReport = @{
        Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        ProjectPath = $ProjectPath
        Summary = @{
            TotalIssues = 0
            CriticalIssues = 0
            Warnings = 0
            NeedsAICheck = 0
        }
        Context = @()
    }
    
    # 1. Structure API - Handlers potentiellement inutilisés
    if ($Results.AIContext -and $Results.AIContext.StructureAPI) {
        $structureAPI = $Results.AIContext.StructureAPI
        if ($structureAPI.Questions -and $structureAPI.Questions.Count -gt 0) {
            foreach ($question in $structureAPI.Questions) {
                $aiReport.Context += @{
                    Category = "Structure API"
                    Type = "Unused Handler"
                    Handler = $question.Handler
                    DefinedIn = $question.DefinedIn
                    DefinedAt = $question.DefinedAt
                    Line = $question.Line
                    RoutingPatterns = $question.RoutingPatterns
                    PotentialRoutes = $question.PotentialRoutes
                    Question = $question.Question
                    CodeContext = Get-CodeContext -FilePath $question.DefinedAt -Line $question.Line
                    RoutingContext = Get-RoutingContext -ProjectPath $ProjectPath -HandlerName $question.Handler
                    Severity = $question.Severity
                    NeedsAICheck = $true
                }
                $aiReport.Summary.NeedsAICheck++
            }
        }
    }
    
    # 2. Imports potentiellement inutilisés
    if ($Results.Warnings -match "import.*inutilis") {
        $aiReport.Context += @{
            Category = "Imports"
            Type = "Potentially Unused Imports"
            Count = ($Results.Warnings | Where-Object { $_ -match "import.*inutilis" }).Count
            Question = "Ces imports sont-ils vraiment inutilisés ou utilisés de manière conditionnelle/dynamique ?"
            NeedsAICheck = $true
        }
        $aiReport.Summary.NeedsAICheck++
    }
    
    # 3. Timers sans cleanup
    if ($Results.Warnings -match "timer.*cleanup") {
        $aiReport.Context += @{
            Category = "Performance"
            Type = "Timers Without Cleanup"
            Count = ($Results.Warnings | Where-Object { $_ -match "timer.*cleanup" }).Count
            Question = "Ces timers sont-ils dans des hooks React avec cleanup automatique ou nécessitent-ils un cleanup manuel ?"
            NeedsAICheck = $true
        }
        $aiReport.Summary.NeedsAICheck++
    }
    
    # 4. Requêtes SQL N+1
    if ($Results.Warnings -match "N\+1|requête.*boucle") {
        $aiReport.Context += @{
            Category = "Performance"
            Type = "SQL N+1 Queries"
            Count = ($Results.Warnings | Where-Object { $_ -match "N\+1|requête.*boucle" }).Count
            Question = "Ces requêtes sont-elles vraiment N+1 ou utilisent-elles des JOINs pour éviter le problème ?"
            NeedsAICheck = $true
        }
        $aiReport.Summary.NeedsAICheck++
    }
    
    $aiReport.Summary.TotalIssues = $Results.Issues.Count
    $aiReport.Summary.CriticalIssues = ($Results.Issues | Where-Object { $_.Severity -eq "high" }).Count
    $aiReport.Summary.Warnings = $Results.Warnings.Count
    
    # Sauvegarder le rapport
    if ($OutputFile) {
        $aiReport | ConvertTo-Json -Depth 10 | Out-File $OutputFile -Encoding UTF8
        Write-Host "  [OK] Rapport IA généré: $OutputFile" -ForegroundColor Green
    }
    
    return $aiReport
}

function Get-CodeContext {
    param(
        [string]$FilePath,
        [int]$Line,
        [int]$ContextLines = 10
    )
    
    if (-not (Test-Path $FilePath)) {
        return @{}
    }
    
    $content = Get-Content $FilePath
    $startLine = [Math]::Max(0, $Line - $ContextLines)
    $endLine = [Math]::Min($content.Count - 1, $Line + $ContextLines)
    
    return @{
        File = Split-Path $FilePath -Leaf
        StartLine = $startLine + 1
        EndLine = $endLine + 1
        Code = $content[$startLine..$endLine] -join "`n"
    }
}

function Get-RoutingContext {
    param(
        [string]$ProjectPath,
        [string]$HandlerName
    )
    
    $routingContext = @{
        Patterns = @()
        Files = @()
    }
    
    # Chercher dans les fichiers API
    $apiFiles = @("api.php", "router.php", "index.php")
    foreach ($apiFile in $apiFiles) {
        $filePath = Join-Path $ProjectPath $apiFile
        if (Test-Path $filePath) {
            $content = Get-Content $filePath -Raw
            if ($content -match $HandlerName) {
                $routingContext.Files += $apiFile
                # Extraire les patterns de routing autour du handler
                $matches = [regex]::Matches($content, ".{0,200}$HandlerName.{0,200}", [System.Text.RegularExpressions.RegexOptions]::Singleline)
                foreach ($match in $matches) {
                    $routingContext.Patterns += $match.Value
                }
            }
        }
    }
    
    return $routingContext
}

