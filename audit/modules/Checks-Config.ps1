# ===============================================================================
# VÉRIFICATION : CONFIGURATION DÉPLOIEMENT
# ===============================================================================

function Invoke-Check-Config {
    param(
        [Parameter(Mandatory=$true)]
        [hashtable]$Config,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Results,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$ProjectInfo,
        
        [Parameter(Mandatory=$true)]
        [string]$ProjectPath
    )
    
    Write-Section "[14/18] Configuration - Docker, Next.js, Déploiement"
    
    try {
        $configScore = 10.0
        $configIssues = @()
        $configWarnings = @()
        
        # Charger les fichiers de configuration
        $dockerCompose = $null
        $nextConfig = $null
        $envExample = $null
        $renderYaml = $null
        $dockerfileDashboard = $null
        $packageJson = $null
        
        if (Test-Path (Join-Path $ProjectPath "docker-compose.yml")) {
            $dockerCompose = Get-Content (Join-Path $ProjectPath "docker-compose.yml") -Raw -ErrorAction SilentlyContinue
        }
        if (Test-Path (Join-Path $ProjectPath "next.config.js")) {
            $nextConfig = Get-Content (Join-Path $ProjectPath "next.config.js") -Raw -ErrorAction SilentlyContinue
        }
        if (Test-Path (Join-Path $ProjectPath "env.example")) {
            $envExample = Get-Content (Join-Path $ProjectPath "env.example") -Raw -ErrorAction SilentlyContinue
        }
        if (Test-Path (Join-Path $ProjectPath "render.yaml")) {
            $renderYaml = Get-Content (Join-Path $ProjectPath "render.yaml") -Raw -ErrorAction SilentlyContinue
        }
        if (Test-Path (Join-Path $ProjectPath "Dockerfile.dashboard")) {
            $dockerfileDashboard = Get-Content (Join-Path $ProjectPath "Dockerfile.dashboard") -Raw -ErrorAction SilentlyContinue
        }
        if (Test-Path (Join-Path $ProjectPath "package.json")) {
            try {
                $packageJson = Get-Content (Join-Path $ProjectPath "package.json") -Raw | ConvertFrom-Json
            } catch {
                Write-Warn "Erreur lecture package.json"
            }
        }
        
        # Vérifications Docker (si applicable)
        if ($ProjectInfo.Type -match "React|Next") {
            if ($dockerCompose) {
                if ($dockerCompose -match "dashboard:" -or $dockerCompose -match "ott-dashboard" -or $dockerCompose -match "next") {
                    Write-OK "Service dashboard présent dans docker-compose.yml"
                } else {
                    Write-Warn "Service dashboard potentiellement manquant"
                    $configWarnings += "Service dashboard non détecté dans docker-compose.yml"
                    $configScore -= 1.0
                }
            }
        }
        
        # Vérifications Next.js
        if ($nextConfig) {
            Write-OK "next.config.js présent"
            
            if ($nextConfig -match "output.*standalone" -or $nextConfig -match "standalone") {
                Write-OK "Configuration standalone présente"
            } else {
                Write-Warn "Configuration standalone manquante"
                $configWarnings += "Configuration standalone manquante"
                $configScore -= 0.5
            }
        }
        
        # Vérifications package.json
        if ($packageJson) {
            $scripts = $packageJson.scripts
            if ($scripts) {
                $requiredScripts = @("dev", "build")
                foreach ($script in $requiredScripts) {
                    if ($scripts.PSObject.Properties.Name -contains $script) {
                        Write-OK "Script '$script' présent"
                    } else {
                        Write-Warn "Script '$script' manquant"
                        $configWarnings += "Script '$script' manquant dans package.json"
                        $configScore -= 0.5
                    }
                }
            }
        }
        
        # Vérifications env.example
        if ($envExample) {
            Write-OK "env.example présent"
            $criticalVars = @("DATABASE_URL", "JWT_SECRET", "NEXT_PUBLIC_API_URL")
            $missingVars = 0
            foreach ($var in $criticalVars) {
                if ($envExample -notmatch "$var\s*=") {
                    $missingVars++
                }
            }
            if ($missingVars -gt 0) {
                Write-Warn "$missingVars variable(s) critique(s) manquante(s) dans env.example"
                $configWarnings += "Variables critiques manquantes dans env.example"
                $configScore -= 0.3 * $missingVars
            }
        } else {
            Write-Warn "env.example manquant"
            $configWarnings += "env.example manquant"
            $configScore -= 1.0
        }
        
        Write-OK "Vérification configuration terminée"
        $Results.Scores["Configuration"] = [Math]::Max($configScore, 0)
        
        if ($configIssues.Count -gt 0) {
            $Results.Issues += $configIssues
        }
        if ($configWarnings.Count -gt 0) {
            $Results.Warnings += $configWarnings
        }
    } catch {
        Write-Err "Erreur vérification configuration: $($_.Exception.Message)"
        $Results.Scores["Configuration"] = 5
    }
}

