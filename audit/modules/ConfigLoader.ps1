# ===============================================================================
# CHARGEMENT DE CONFIGURATION
# ===============================================================================

function Load-Config {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Path,
        
        [Parameter(Mandatory=$false)]
        [string]$ConfigFile,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$ProjectInfo
    )
    
    # Configuration par défaut
    $defaultConfig = Get-DefaultConfig
    
    # Chercher un fichier de configuration projet
    $configFiles = @()
    if ($ConfigFile) {
        $configFiles += $ConfigFile
    }
    
    $configFiles += @(
        (Join-Path $Path "audit.config.yaml"),
        (Join-Path $Path "audit.config.json"),
        (Join-Path $script:AuditRoot "config" "default.yaml")
    )
    
    $projectConfig = $null
    foreach ($cfgFile in $configFiles) {
        if (Test-Path $cfgFile) {
            try {
                if ($cfgFile -match "\.yaml$|\.yml$") {
                    # Charger YAML (simplifié, peut être amélioré avec module PowerShell-YAML)
                    $projectConfig = Get-ConfigFromYAML -File $cfgFile
                } else {
                    $projectConfig = Get-Content $cfgFile -Raw | ConvertFrom-Json | ConvertTo-Hashtable
                }
                Write-Info "Configuration chargée: $cfgFile"
                break
            } catch {
                Write-Warn "Erreur chargement config $cfgFile : $($_.Exception.Message)"
            }
        }
    }
    
    # Merge avec config par défaut
    $config = Merge-Config -Default $defaultConfig -Project $projectConfig -ProjectInfo $ProjectInfo
    
    return $config
}

function Get-DefaultConfig {
    return @{
        Project = @{
            Name = "Projet"
            Type = "Unknown"
        }
        Checks = @{
            DeadCode = @{ Enabled = $true; Severity = "high" }
            Duplication = @{ Enabled = $true; Threshold = 50 }
            Complexity = @{ Enabled = $true; MaxFileLines = 500; MaxFunctionLines = 100 }
            Security = @{ Enabled = $true }
            Performance = @{ Enabled = $true }
            Tests = @{ Enabled = $true }
            Documentation = @{ Enabled = $true }
            Organization = @{ Enabled = $true }
        }
        API = @{
            Enabled = $false
        }
        Database = @{
            Enabled = $false
        }
        AI = @{
            Enabled = $true
            AnalyzeWhen = @("dead_code_detected", "security_issue_found", "complex_code_detected", "duplication_found")
            Model = "gpt-4"
        }
        Exclude = @{
            Directories = @("node_modules", ".next", "dist", "build", ".git", "out", "docs/_next")
            Files = @("**/*.min.js", "**/*.bundle.js")
        }
        ScoreWeights = @{
            "Architecture" = 1.0
            "CodeMort" = 1.5
            "Duplication" = 1.2
            "Complexity" = 1.2
            "Security" = 2.0
            "Performance" = 1.0
            "API" = 1.5
            "Database" = 1.0
            "Tests" = 0.8
            "Documentation" = 0.5
            "Configuration" = 1.5
            "Structure API" = 1.0
            "Optimisations" = 1.2
            "Organization" = 0.8
            "UI/UX" = 0.8
        }
    }
}

function Get-ConfigFromYAML {
    param([string]$File)
    
    # Parser YAML simplifié (format basique)
    # Pour une vraie implémentation, utiliser PowerShell-YAML module
    $content = Get-Content $File -Raw
    
    # Convertir en hashtable basique
    # Cette implémentation est simplifiée, pour le YAML complet, utiliser un module
    $config = @{}
    
    # Détecter des patterns basiques
    if ($content -match "project:") {
        $config.Project = @{ Name = "Projet" }
    }
    
    # Si YAML complexe, retourner null et utiliser les valeurs par défaut
    if ($content.Length -gt 100) {
        Write-Warn "YAML complexe détecté. Utilisation config par défaut (installez PowerShell-YAML pour support complet)"
        return $null
    }
    
    return $config
}

function Merge-Config {
    param(
        [hashtable]$Default,
        [hashtable]$Project,
        [hashtable]$ProjectInfo
    )
    
    # Démarrer avec la config par défaut
    $merged = $Default.Clone()
    
    # Mettre à jour avec les infos du projet
    $merged.Project.Name = $ProjectInfo.Name
    $merged.Project.Type = $ProjectInfo.Type
    $merged.Project.Framework = $ProjectInfo.Framework
    
    # Si config projet fournie, merger
    if ($Project) {
        foreach ($key in $Project.Keys) {
            if ($merged.ContainsKey($key)) {
                if ($merged[$key] -is [hashtable] -and $Project[$key] -is [hashtable]) {
                    $merged[$key] = Merge-Hashtable -H1 $merged[$key] -H2 $Project[$key]
                } else {
                    $merged[$key] = $Project[$key]
                }
            } else {
                $merged[$key] = $Project[$key]
            }
        }
    }
    
    return $merged
}

function Merge-Hashtable {
    param(
        [hashtable]$H1,
        [hashtable]$H2
    )
    
    $merged = $H1.Clone()
    foreach ($key in $H2.Keys) {
        $merged[$key] = $H2[$key]
    }
    return $merged
}

function ConvertTo-Hashtable {
    param([PSObject]$Object)
    
    $hash = @{}
    foreach ($prop in $Object.PSObject.Properties) {
        if ($prop.Value -is [PSObject] -and $prop.Value -isnot [Array]) {
            $hash[$prop.Name] = ConvertTo-Hashtable -Object $prop.Value
        } elseif ($prop.Value -is [Array]) {
            $hash[$prop.Name] = $prop.Value
        } else {
            $hash[$prop.Name] = $prop.Value
        }
    }
    return $hash
}

