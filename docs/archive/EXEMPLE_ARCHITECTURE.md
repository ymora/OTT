# 📁 Exemple d'Architecture Concrète

## Structure Complète du Module

```
audit-intelligent/
│
├── README.md
├── LICENSE
│
├── AuditEngine.ps1              # Point d'entrée principal
│
├── core/
│   ├── ProjectDetector.ps1
│   ├── ConfigLoader.ps1
│   ├── FileScanner.ps1
│   └── ReportGenerator.ps1
│
├── checks/
│   ├── GenericChecks.ps1
│   ├── ReactChecks.ps1
│   ├── PHPChecks.ps1
│   ├── NodeChecks.ps1
│   └── SecurityChecks.ps1
│
├── ai/
│   ├── AIClient.ps1
│   ├── PromptBuilder.ps1
│   └── ResponseParser.ps1
│
├── config/
│   ├── default.yaml
│   └── templates/
│       ├── react-nextjs.yaml
│       ├── php-api.yaml
│       └── nodejs.yaml
│
└── templates/
    └── report.html              # Template rapport HTML
```

---

## 📝 Exemple de Fichier Principal

### AuditEngine.ps1

```powershell
# ===============================================================================
# Audit Intelligent Automatique - Moteur Principal
# ===============================================================================

[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)]
    [string]$Path = ".",
    
    [Parameter(Mandatory=$false)]
    [string]$Config,
    
    [Parameter(Mandatory=$false)]
    [switch]$UseAI,
    
    [Parameter(Mandatory=$false)]
    [string]$AIProvider = "openai",
    
    [Parameter(Mandatory=$false)]
    [switch]$AutoFix,
    
    [Parameter(Mandatory=$false)]
    [ValidateSet("console", "markdown", "html", "json", "all")]
    [string[]]$Format = @("console", "html")
)

$ErrorActionPreference = "Stop"

# Charger modules
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
. "$scriptPath/core/ProjectDetector.ps1"
. "$scriptPath/core/ConfigLoader.ps1"
. "$scriptPath/core/FileScanner.ps1"
. "$scriptPath/checks/GenericChecks.ps1"

if ($UseAI) {
    . "$scriptPath/ai/AIClient.ps1"
}

Write-Host "🔍 Audit Intelligent Automatique" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Gray

# 1. Détection projet
Write-Host "`n[1/5] Détection du type de projet..." -ForegroundColor Yellow
$projectInfo = Get-ProjectInfo -Path $Path
Write-Host "  Type: $($projectInfo.Type)" -ForegroundColor Green
Write-Host "  Framework: $($projectInfo.Framework)" -ForegroundColor Green

# 2. Chargement configuration
Write-Host "`n[2/5] Chargement configuration..." -ForegroundColor Yellow
$config = Load-Config -Path $Path -ConfigFile $Config -ProjectInfo $projectInfo
Write-Host "  Configuration chargée: $($config.Project.Name)" -ForegroundColor Green

# 3. Scan fichiers
Write-Host "`n[3/5] Scan fichiers..." -ForegroundColor Yellow
$files = Get-ProjectFiles -Path $Path -Config $config
Write-Host "  $($files.Count) fichiers analysés" -ForegroundColor Green

# 4. Exécution vérifications
Write-Host "`n[4/5] Exécution vérifications..." -ForegroundColor Yellow
$results = @{
    Issues = @()
    Warnings = @()
    Recommendations = @()
    Scores = @{}
}

# Vérifications génériques
$results = Invoke-GenericChecks -Files $files -Config $config -Results $results

# Vérifications spécifiques selon type projet
switch ($projectInfo.Type) {
    "React" { 
        . "$scriptPath/checks/ReactChecks.ps1"
        $results = Invoke-ReactChecks -Files $files -Config $config -Results $results
    }
    "PHP" { 
        . "$scriptPath/checks/PHPChecks.ps1"
        $results = Invoke-PHPChecks -Files $files -Config $config -Results $results
    }
    "Node.js" { 
        . "$scriptPath/checks/NodeChecks.ps1"
        $results = Invoke-NodeChecks -Files $files -Config $config -Results $results
    }
}

# 5. Analyse IA (si activé)
if ($UseAI -and $config.AI.Enabled) {
    Write-Host "`n[5/5] Analyse IA..." -ForegroundColor Yellow
    
    # Pour chaque problème détecté, demander à l'IA
    foreach ($issue in $results.Issues) {
        if ($config.AI.AnalyzeWhen -contains $issue.Type) {
            Write-Host "  🤖 Analyse: $($issue.Description)..." -ForegroundColor Cyan
            
            $aiResponse = Invoke-AIAnalysis `
                -Issue $issue `
                -ProjectInfo $projectInfo `
                -Config $config
            
            $issue.AIAnalysis = $aiResponse
            $issue.SuggestedFix = $aiResponse.SuggestedCode
            
            Write-Host "    → $($aiResponse.Summary)" -ForegroundColor Gray
        }
    }
}

# 6. Génération rapport
Write-Host "`n[6/6] Génération rapport..." -ForegroundColor Yellow
$reportPath = Generate-Report -Results $results -Config $config -Format $Format -OutputDir "$Path/audit-reports"
Write-Host "  Rapport généré: $reportPath" -ForegroundColor Green

# 7. Score final
$globalScore = Calculate-GlobalScore -Results $results
Write-Host "`n" + ("=" * 60) -ForegroundColor Gray
Write-Host "🎯 Score Global: $globalScore/10" -ForegroundColor $(if($globalScore -ge 8){"Green"}elseif($globalScore -ge 6){"Yellow"}else{"Red"})
Write-Host ("=" * 60) -ForegroundColor Gray

return $results
```

---

## 🔍 Exemple de Module de Détection

### core/ProjectDetector.ps1

```powershell
function Get-ProjectInfo {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Path
    )
    
    $info = @{
        Type = "Unknown"
        Framework = "Unknown"
        Version = $null
        Language = @()
        HasBackend = $false
        HasFrontend = $false
    }
    
    # Détecter package.json (Node.js/React)
    if (Test-Path "$Path/package.json") {
        $package = Get-Content "$Path/package.json" | ConvertFrom-Json
        
        $info.Language += "JavaScript"
        $info.Version = $package.version
        
        # Détecter React/Next.js
        if ($package.dependencies.'react' -or $package.devDependencies.'react') {
            $info.HasFrontend = $true
            if ($package.dependencies.'next' -or $package.devDependencies.'next') {
                $info.Type = "React"
                $info.Framework = "Next.js"
                $info.FrameworkVersion = $package.dependencies.'next' -or $package.devDependencies.'next'
            } else {
                $info.Type = "React"
                $info.Framework = "React"
                $info.FrameworkVersion = $package.dependencies.'react' -or $package.devDependencies.'react'
            }
        }
        
        # Détecter Express/Node.js
        if ($package.dependencies.'express' -or $package.devDependencies.'express') {
            $info.HasBackend = $true
            if (-not $info.Type -eq "React") {
                $info.Type = "Node.js"
                $info.Framework = "Express"
            }
        }
    }
    
    # Détecter composer.json (PHP)
    if (Test-Path "$Path/composer.json") {
        $composer = Get-Content "$Path/composer.json" | ConvertFrom-Json
        $info.Language += "PHP"
        $info.HasBackend = $true
        
        if (-not $info.Type -eq "React") {
            $info.Type = "PHP"
            
            if ($composer.require.'laravel/framework') {
                $info.Framework = "Laravel"
            } elseif ($composer.require.'symfony/symfony') {
                $info.Framework = "Symfony"
            } else {
                $info.Framework = "PHP API"
            }
        }
    }
    
    # Détecter requirements.txt (Python)
    if (Test-Path "$Path/requirements.txt") {
        $info.Language += "Python"
        $info.HasBackend = $true
        if (-not $info.Type -ne "Unknown") {
            $info.Type = "Python"
        }
    }
    
    # Détecter structure Next.js
    if (Test-Path "$Path/app" -or Test-Path "$Path/pages") {
        if ($info.Framework -eq "Next.js") {
            $info.Framework = "Next.js App Router" # ou Pages Router
        }
    }
    
    return $info
}

Export-ModuleMember -Function Get-ProjectInfo
```

---

## 🤖 Exemple de Client IA

### ai/AIClient.ps1

```powershell
function Invoke-AIAnalysis {
    param(
        [Parameter(Mandatory=$true)]
        [hashtable]$Issue,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$ProjectInfo,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Config
    )
    
    $apiKey = $env:OPENAI_API_KEY
    if (-not $apiKey) {
        throw "OPENAI_API_KEY environment variable not set"
    }
    
    # Construire le prompt
    $prompt = Build-AIPrompt -Issue $Issue -ProjectInfo $ProjectInfo -Config $Config
    
    # Appel API OpenAI
    $headers = @{
        "Authorization" = "Bearer $apiKey"
        "Content-Type" = "application/json"
    }
    
    $body = @{
        model = $Config.AI.Model
        messages = @(
            @{
                role = "system"
                content = "Tu es un expert en développement logiciel. Analyse le code et propose des solutions concrètes."
            },
            @{
                role = "user"
                content = $prompt
            }
        )
        temperature = 0.3
        max_tokens = 2000
    } | ConvertTo-Json -Depth 10
    
    try {
        $response = Invoke-RestMethod `
            -Uri "https://api.openai.com/v1/chat/completions" `
            -Method POST `
            -Headers $headers `
            -Body $body
        
        $aiContent = $response.choices[0].message.content
        
        # Parser la réponse
        $parsed = Parse-AIResponse -Content $aiContent
        
        return @{
            Summary = $parsed.Summary
            Analysis = $parsed.Analysis
            SuggestedCode = $parsed.SuggestedCode
            Confidence = $parsed.Confidence
            Action = $parsed.Action  # "delete", "refactor", "ignore", etc.
        }
    } catch {
        Write-Warning "Erreur appel IA: $($_.Exception.Message)"
        return @{
            Summary = "Erreur lors de l'analyse IA"
            Analysis = $_.Exception.Message
            SuggestedCode = $null
            Confidence = 0
            Action = "manual_review"
        }
    }
}

function Build-AIPrompt {
    param(
        [hashtable]$Issue,
        [hashtable]$ProjectInfo,
        [hashtable]$Config
    )
    
    $prompt = @"
Tu es un expert en développement logiciel spécialisé en $($ProjectInfo.Framework).

CONTEXTE PROJET:
- Type: $($ProjectInfo.Type)
- Framework: $($ProjectInfo.Framework)
- Langages: $($ProjectInfo.Language -join ', ')

PROBLÈME DÉTECTÉ:
Type: $($Issue.Type)
Fichier: $($Issue.File)
Ligne: $($Issue.Line)
Description: $($Issue.Description)

CODE CONCERNÉ:
```$($Issue.Language)
$($Issue.Code)
```

QUESTION:
Analyse ce problème et propose une solution concrète. Réponds au format JSON:
{
  "summary": "Résumé en une phrase",
  "analysis": "Analyse détaillée du problème",
  "suggested_code": "Code corrigé si applicable (ou null)",
  "confidence": 0.0-1.0,
  "action": "delete|refactor|fix|ignore|manual_review",
  "reasoning": "Justification de la recommandation"
}
"@
    
    return $prompt
}

function Parse-AIResponse {
    param(
        [string]$Content
    )
    
    # Essayer d'extraire le JSON de la réponse
    $jsonMatch = [regex]::Match($Content, '\{[\s\S]*\}')
    if ($jsonMatch.Success) {
        try {
            $json = $jsonMatch.Value | ConvertFrom-Json
            return @{
                Summary = $json.summary
                Analysis = $json.analysis
                SuggestedCode = $json.suggested_code
                Confidence = $json.confidence
                Action = $json.action
            }
        } catch {
            # Fallback si JSON invalide
        }
    }
    
    # Fallback : parser texte libre
    return @{
        Summary = ($Content -split "`n")[0]
        Analysis = $Content
        SuggestedCode = $null
        Confidence = 0.5
        Action = "manual_review"
    }
}

Export-ModuleMember -Function Invoke-AIAnalysis
```

---

## ⚙️ Exemple de Configuration

### config/templates/react-nextjs.yaml

```yaml
project:
  type: "React/Next.js"
  framework: "Next.js"

checks:
  dead_code:
    enabled: true
    severity: "high"
    scan_directories:
      - "components"
      - "app"
      - "hooks"
  
  code_duplication:
    enabled: true
    threshold: 50
    min_lines: 10
  
  performance:
    enabled: true
    max_file_lines: 500
    max_component_lines: 200
    check_hooks_usage: true
    check_memoization: true
  
  security:
    enabled: true
    scan_xss: true
    scan_secrets: true

custom_rules:
  - name: "Pas de console.log en production"
    pattern: "**/*.{js,jsx,ts,tsx}"
    check: "no_console_log"
    exclude: ["**/logger.js", "**/*.test.{js,ts}", "**/*.spec.{js,ts}"]
  
  - name: "Composants dans components/"
    pattern: "components/**/*.{js,jsx}"
    check: "file_structure"

ai:
  enabled: true
  analyze_when:
    - "dead_code_detected"
    - "complex_component_detected"  # > 200 lignes
    - "duplication_found"
    - "performance_issue"
```

---

## 📊 Exemple de Rapport HTML

Le rapport généré serait un fichier HTML interactif avec :

- **Navigation par catégorie** (Sécurité, Performance, Code Quality, etc.)
- **Filtres** (Severité, Type, Fichier)
- **Diff visuel** (avant/après pour les suggestions IA)
- **Boutons d'action** (Appliquer correction, Ignorer, etc.)
- **Graphiques** (évolution score, répartition problèmes)

---

Cette architecture permet de :
✅ Garder le code modulaire et maintenable  
✅ Facilement ajouter de nouveaux types de checks  
✅ Intégrer différentes APIs IA  
✅ Personnaliser par projet via configuration YAML  
✅ Réutiliser sur n'importe quel projet  

