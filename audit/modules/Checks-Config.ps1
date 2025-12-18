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
    
    Write-Section "[19/21] Configuration - Render, GitHub Pages, Next.js, Déploiement"
    
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
        
        # Vérifications Render (API Backend)
        if ($ProjectInfo.Type -match "PHP|API") {
            if ($renderYaml) {
                if ($renderYaml -match "ott-api" -or $renderYaml -match "type: web") {
                    Write-OK "Service API configuré dans render.yaml"
                } else {
                    Write-Warn "Service API potentiellement manquant"
                    $configWarnings += "Service API non détecté dans render.yaml"
                    $configScore -= 1.0
                }
                
                if ($renderYaml -match "DATABASE_URL") {
                    Write-OK "Variable DATABASE_URL documentée"
                } else {
                    Write-Warn "DATABASE_URL non documentée"
                    $configWarnings += "DATABASE_URL non documentée dans render.yaml"
                    $configScore -= 0.5
                }
                
                if ($renderYaml -match "JWT_SECRET") {
                    Write-OK "Variable JWT_SECRET documentée"
                } else {
                    Write-Warn "JWT_SECRET non documentée"
                    $configWarnings += "JWT_SECRET non documentée dans render.yaml"
                    $configScore -= 0.5
                }
            } else {
                Write-Warn "render.yaml introuvable (optionnel si déploiement manuel)"
                $configWarnings += "render.yaml manquant (peut être configuré directement sur Render)"
                $configScore -= 0.5
            }
        }
        
        # Vérifications GitHub Pages (Frontend)
        if ($ProjectInfo.Type -match "React|Next") {
            $githubWorkflow = $null
            if (Test-Path (Join-Path $ProjectPath ".github/workflows/deploy.yml")) {
                $githubWorkflow = Get-Content (Join-Path $ProjectPath ".github/workflows/deploy.yml") -Raw -ErrorAction SilentlyContinue
                Write-OK "Workflow GitHub Actions présent"
                
                if ($githubWorkflow -match "NEXT_STATIC_EXPORT.*true") {
                    Write-OK "NEXT_STATIC_EXPORT=true configuré (export statique)"
                } else {
                    Write-Warn "NEXT_STATIC_EXPORT peut ne pas être configuré"
                    $configWarnings += "NEXT_STATIC_EXPORT peut ne pas être configuré pour GitHub Pages"
                    $configScore -= 0.5
                }
            } else {
                Write-Warn "Workflow GitHub Actions introuvable"
                $configWarnings += "Workflow GitHub Actions manquant (déploiement GitHub Pages)"
                $configScore -= 1.0
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
        
        # Générer contexte pour l'IA si nécessaire
        $aiContext = @()
        if ($configWarnings.Count -gt 0) {
            $aiContext += @{
                Category = "Configuration"
                Type = "Configuration Issues"
                Warnings = $configWarnings
                Count = $configWarnings.Count
                Severity = "medium"
                NeedsAICheck = $true
                Question = "$($configWarnings.Count) problème(s) de configuration détecté(s) (Render, GitHub Pages, Next.js, env.example). Ces problèmes sont-ils critiques pour le déploiement ou peuvent-ils être ignorés si la configuration est faite manuellement ?"
            }
        }
        
        Write-OK "Vérification configuration terminée"
        $Results.Scores["Configuration"] = [Math]::Max($configScore, 0)
        
        if ($configIssues.Count -gt 0) {
            $Results.Issues += $configIssues
        }
        if ($configWarnings.Count -gt 0) {
            $Results.Warnings += $configWarnings
        }
        
        # Sauvegarder le contexte pour l'IA
        if (-not $Results.AIContext) {
            $Results.AIContext = @{}
        }
        if ($aiContext.Count -gt 0) {
            $Results.AIContext.Configuration = @{
                Questions = $aiContext
            }
        }
    } catch {
        Write-Err "Erreur vérification configuration: $($_.Exception.Message)"
        $Results.Scores["Configuration"] = 5
    }
}

