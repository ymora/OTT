# ===============================================================================
# AUDIT INTELLIGENT AUTOMATIQUE
# ===============================================================================
# Point d'entrée principal pour l'audit intelligent
# Usage: .\audit\Audit-Intelligent.ps1
# ===============================================================================

[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)]
    [string]$ProjectPath = ".",
    
    [Parameter(Mandatory=$false)]
    [string]$ConfigFile,
    
    [Parameter(Mandatory=$false)]
    [switch]$UseAI = $true,
    
    [Parameter(Mandatory=$false)]
    [int]$MaxQuestions = 15
)

$ErrorActionPreference = "Continue"
$script:Verbose = $PSCmdlet.MyInvocation.BoundParameters["Verbose"].IsPresent

# Déterminer le chemin des modules
$script:AuditRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$modulesPath = Join-Path $script:AuditRoot "modules"
$configPath = Join-Path $script:AuditRoot "config"

# Charger les modules
. (Join-Path $modulesPath "Utils.ps1")
. (Join-Path $modulesPath "ProjectDetector.ps1")
. (Join-Path $modulesPath "ConfigLoader.ps1")
. (Join-Path $modulesPath "FileScanner.ps1")
. (Join-Path $modulesPath "Checks-Architecture.ps1")
. (Join-Path $modulesPath "Checks-CodeMort.ps1")
. (Join-Path $modulesPath "Checks-Duplication.ps1")
. (Join-Path $modulesPath "Checks-Complexity.ps1")
. (Join-Path $modulesPath "Checks-Security.ps1")
. (Join-Path $modulesPath "Checks-Performance.ps1")
. (Join-Path $modulesPath "Checks-Routes.ps1")
. (Join-Path $modulesPath "Checks-API.ps1")
. (Join-Path $modulesPath "Checks-Database.ps1")
. (Join-Path $modulesPath "Checks-Tests.ps1")
. (Join-Path $modulesPath "Checks-Documentation.ps1")
. (Join-Path $modulesPath "Checks-Organization.ps1")
. (Join-Path $modulesPath "Checks-UI.ps1")
. (Join-Path $modulesPath "Checks-Config.ps1")
. (Join-Path $modulesPath "Checks-StructureAPI.ps1")
. (Join-Path $modulesPath "Checks-Optimizations.ps1")
. (Join-Path $modulesPath "Checks-TimeTracking.ps1")
. (Join-Path $modulesPath "AI-Questions.ps1")
. (Join-Path $modulesPath "AI-Response.ps1")
. (Join-Path $modulesPath "ReportGenerator.ps1")

# Initialiser résultats
$script:auditResults = @{
    Scores = @{}
    Issues = @()
    Warnings = @()
    Recommendations = @()
    Stats = @{}
    StartTime = Get-Date
}

# ===============================================================================
# FONCTION PRINCIPALE
# ===============================================================================

function Start-Audit {
    Write-Logo
    
    Write-Host "🔍 Détection du projet..." -ForegroundColor Cyan
    $projectInfo = Get-ProjectInfo -Path $ProjectPath
    
    Write-Host "  Type: $($projectInfo.Type)" -ForegroundColor Green
    Write-Host "  Framework: $($projectInfo.Framework)" -ForegroundColor Green
    Write-Host ""
    
    Write-Host "⚙️  Chargement configuration..." -ForegroundColor Cyan
    $config = Load-Config -Path $ProjectPath -ConfigFile $ConfigFile -ProjectInfo $projectInfo
    
    Write-Host "  Configuration: $($config.Project.Name)" -ForegroundColor Green
    Write-Host ""
    
    Write-Host "📂 Scan des fichiers..." -ForegroundColor Cyan
    $files = Get-ProjectFiles -Path $ProjectPath -Config $config
    
    Write-Host "  $($files.Count) fichiers analysés" -ForegroundColor Green
    Write-Host ""
    
    # Exécuter toutes les vérifications
    Write-Host "🔎 Exécution des vérifications..." -ForegroundColor Cyan
    Write-Host ("=" * 80) -ForegroundColor Gray
    
    # PHASE 1: Architecture
    Invoke-Check-Architecture -Files $files -Config $config -Results $script:auditResults
    
    # PHASE 2: Code Mort
    Invoke-Check-CodeMort -Files $files -Config $config -Results $script:auditResults
    
    # PHASE 3: Duplication
    Invoke-Check-Duplication -Files $files -Config $config -Results $script:auditResults
    
    # PHASE 4: Complexité
    Invoke-Check-Complexity -Files $files -Config $config -Results $script:auditResults
    
    # PHASE 5: Routes (si applicable)
    if ($projectInfo.Type -match "React|Next") {
        Invoke-Check-Routes -Files $files -Config $config -Results $script:auditResults -ProjectInfo $projectInfo
    }
    
    # PHASE 6: API Tests
    if ($config.API.Enabled) {
        Invoke-Check-API -Config $config -Results $script:auditResults
    }
    
    # PHASE 7: Database
    if ($config.Database.Enabled) {
        Invoke-Check-Database -Config $config -Results $script:auditResults
    }
    
    # PHASE 8: Sécurité
    Invoke-Check-Security -Files $files -Config $config -Results $script:auditResults -ProjectInfo $projectInfo
    
    # PHASE 9: Performance
    Invoke-Check-Performance -Files $files -Config $config -Results $script:auditResults -ProjectInfo $projectInfo
    
    # PHASE 10: Tests
    Invoke-Check-Tests -Files $files -Config $config -Results $script:auditResults
    
    # PHASE 11: Documentation
    Invoke-Check-Documentation -Files $files -Config $config -Results $script:auditResults
    
    # PHASE 12: Organisation
    Invoke-Check-Organization -Files $files -Config $config -Results $script:auditResults
    
    # PHASE 13: UI/UX (si applicable)
    if ($projectInfo.Type -match "React|Next") {
        Invoke-Check-UI -Files $files -Config $config -Results $script:auditResults
    }
    
    # PHASE 14: Configuration
    Invoke-Check-Config -Config $config -Results $script:auditResults -ProjectInfo $projectInfo -ProjectPath $ProjectPath
    
    # PHASE 15: Structure API (si applicable)
    if ($projectInfo.HasBackend -or (Test-Path (Join-Path $ProjectPath "api.php"))) {
        Invoke-Check-StructureAPI -Results $script:auditResults -ProjectPath $ProjectPath
    }
    
    # PHASE 16: Optimisations Avancées
    Invoke-Check-Optimizations -Files $files -Config $config -Results $script:auditResults -ProjectInfo $projectInfo
    
    # PHASE 17: Suivi du Temps Git (optionnel)
    Invoke-Check-TimeTracking -ProjectPath $ProjectPath
    
    Write-Host ("=" * 80) -ForegroundColor Gray
    Write-Host ""
    
    # Vérifier d'abord s'il y a des réponses IA à intégrer
    $aiResponseFile = Join-Path $ProjectPath "audit" "audit-ai-resp.json"
    if (Test-Path $aiResponseFile) {
        Write-Host "🤖 Intégration des réponses IA..." -ForegroundColor Cyan
        Integrate-AIResponses -ResponseFile $aiResponseFile -Results $script:auditResults
        Write-Host "  ✅ Réponses IA intégrées" -ForegroundColor Green
        Write-Host ""
    } elseif ($UseAI -and $config.AI.Enabled) {
        # Générer des questions pour l'IA seulement si pas de réponses existantes
        Write-Host "🤖 Génération des questions pour l'IA..." -ForegroundColor Cyan
        
        $aiFile = Generate-AIQuestions `
            -Issues $script:auditResults.Issues `
            -Warnings $script:auditResults.Warnings `
            -ProjectInfo $projectInfo `
            -Config $config `
            -MaxQuestions $MaxQuestions `
            -OutputDir (Join-Path $ProjectPath "audit")
        
        if ($aiFile) {
            Write-Host "  ✅ Fichier généré: $aiFile" -ForegroundColor Green
            Write-Host ""
            Write-Host "📝 Fichier créé pour analyse IA" -ForegroundColor Yellow
            Write-Host "   → Le fichier 'audit/NEEDS_AI_ANALYSIS.txt' indique que l'analyse IA est nécessaire" -ForegroundColor Cyan
            Write-Host "   → Dites-moi: 'Analyse audit/audit-ai.json et réponds'" -ForegroundColor Cyan
            Write-Host ""
            
            # Créer un fichier indicateur
            @"
L'audit a généré des questions pour analyse IA.
Fichier: audit/audit-ai.json

Pour continuer:
1. Dites à l'IA: 'Analyse audit/audit-ai.json et réponds'
2. L'IA va générer: audit/audit-ai-resp.json
3. Relancez l'audit ou dites: 'Continue audit avec réponses IA'
"@ | Out-File -FilePath (Join-Path $ProjectPath "audit" "NEEDS_AI_ANALYSIS.txt") -Encoding UTF8
            
            Write-Host "⏸️  Audit en pause - Attente de l'analyse IA" -ForegroundColor Yellow
            Write-Host ""
            Write-Host "💡 Astuce: Dites 'Continue audit avec réponses IA' une fois que l'IA a répondu" -ForegroundColor Cyan
            return
        }
    }
    
    # Générer le rapport final
    Write-Host "📊 Génération du rapport..." -ForegroundColor Cyan
    
    $auditDir = Join-Path $ProjectPath "audit"
    if (-not (Test-Path $auditDir)) {
        New-Item -ItemType Directory -Path $auditDir -Force | Out-Null
    }
    
    $reportPath = Generate-Report `
        -Results $script:auditResults `
        -Config $config `
        -ProjectInfo $projectInfo `
        -OutputDir (Join-Path $auditDir "reports")
    
    Write-Host "  ✅ Rapport généré: $reportPath" -ForegroundColor Green
    Write-Host ""
    
    # Afficher le score final
    $globalScore = Calculate-GlobalScore -Results $script:auditResults -Config $config
    Write-FinalScore -Score $globalScore -Results $script:auditResults
    
    return $script:auditResults
}

# ===============================================================================
# EXECUTION
# ===============================================================================

try {
    $results = Start-Audit
    exit 0
} catch {
    Write-Error "Erreur fatale: $($_.Exception.Message)"
    Write-Error $_.ScriptStackTrace
    exit 1
}

