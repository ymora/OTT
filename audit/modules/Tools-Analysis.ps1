# ===============================================================================
# MODULE : OUTILS D'ANALYSE AUTOMATIQUE
# ===============================================================================
# Fonctions pour exécuter et parser les résultats d'outils externes
# (ESLint, Jest, npm audit, dependency-cruiser, jscpd, PHPStan, PSScriptAnalyzer)

# Fonction pour exécuter ESLint et parser les résultats
function Invoke-ESLintAnalysis {
    param([string]$ProjectRoot)
    
    $result = @{
        Success = $false
        Errors = 0
        Warnings = 0
        Issues = @()
        Score = 10
    }
    
    try {
        if (-not (Test-Path (Join-Path $ProjectRoot "package.json"))) {
            Write-Info "  package.json non trouvé, ESLint ignoré"
            return $result
        }
        
        # Vérifier si ESLint est installé
        $eslintInstalled = $false
        try {
            $npmList = npm list eslint --depth=0 2>&1
            if ($LASTEXITCODE -eq 0 -or $npmList -match "eslint@") {
                $eslintInstalled = $true
            }
        } catch {
            # Ignorer
        }
        
        if (-not $eslintInstalled) {
            Write-Info "  ESLint non installé, ignoré"
            return $result
        }
        
        Write-Info "  Exécution ESLint..."
        $eslintOutput = & npm run lint -- --format json 2>&1 | Out-String
        
        # Parser le JSON (ESLint peut retourner du JSON même avec des erreurs)
        try {
            # Extraire le JSON de la sortie (peut contenir des warnings npm)
            $jsonStart = $eslintOutput.IndexOf('[')
            $jsonEnd = $eslintOutput.LastIndexOf(']')
            if ($jsonStart -ge 0 -and $jsonEnd -gt $jsonStart) {
                $jsonContent = $eslintOutput.Substring($jsonStart, $jsonEnd - $jsonStart + 1)
                $eslintResults = $jsonContent | ConvertFrom-Json
                
                if ($eslintResults) {
                    $result.Success = $true
                    foreach ($file in $eslintResults) {
                        if ($file.messages) {
                            foreach ($message in $file.messages) {
                                if ($message.severity -eq 2) {
                                    $result.Errors++
                                    $result.Issues += "$($file.filePath):$($message.line): $($message.message)"
                                } elseif ($message.severity -eq 1) {
                                    $result.Warnings++
                                }
                            }
                        }
                    }
                    
                    # Calculer le score (10 - erreurs*0.5 - warnings*0.1)
                    $result.Score = [Math]::Max(0, 10 - ($result.Errors * 0.5) - ($result.Warnings * 0.1))
                }
            }
        } catch {
            # Si le parsing échoue, essayer de détecter des erreurs dans la sortie
            if ($eslintOutput -match "error|Error|ERROR") {
                $result.Errors = 1
                $result.Score = 8
            }
        }
    } catch {
        Write-Info "  Erreur ESLint: $($_.Exception.Message)"
    }
    
    return $result
}

# Fonction pour exécuter Jest et parser les résultats
function Invoke-JestAnalysis {
    param([string]$ProjectRoot)
    
    $result = @{
        Success = $false
        TestsTotal = 0
        TestsPassed = 0
        TestsFailed = 0
        Coverage = 0
        Score = 10
    }
    
    try {
        if (-not (Test-Path (Join-Path $ProjectRoot "package.json"))) {
            Write-Info "  package.json non trouvé, Jest ignoré"
            return $result
        }
        
        # Vérifier si Jest est installé
        $jestInstalled = $false
        try {
            $npmList = npm list jest --depth=0 2>&1
            if ($LASTEXITCODE -eq 0 -or $npmList -match "jest@") {
                $jestInstalled = $true
            }
        } catch {
            # Ignorer
        }
        
        if (-not $jestInstalled) {
            Write-Info "  Jest non installé, ignoré"
            return $result
        }
        
        Write-Info "  Exécution Jest..."
        $jestOutput = & npm test -- --json --coverage 2>&1 | Out-String
        
        # Parser le JSON Jest
        try {
            $jsonStart = $jestOutput.IndexOf('{')
            $jsonEnd = $jestOutput.LastIndexOf('}')
            if ($jsonStart -ge 0 -and $jsonEnd -gt $jsonStart) {
                $jsonContent = $jestOutput.Substring($jsonStart, $jsonEnd - $jsonStart + 1)
                $jestResults = $jsonContent | ConvertFrom-Json
                
                if ($jestResults) {
                    $result.Success = $true
                    $result.TestsTotal = $jestResults.numTotalTests
                    $result.TestsPassed = $jestResults.numPassedTests
                    $result.TestsFailed = $jestResults.numFailedTests
                    
                    # Calculer la couverture si disponible
                    if ($jestResults.coverageMap) {
                        $totalLines = 0
                        $coveredLines = 0
                        foreach ($file in $jestResults.coverageMap.GetEnumerator()) {
                            if ($file.Value.s) {
                                $totalLines += $file.Value.s.Count
                                $coveredLines += ($file.Value.s | Where-Object { $_ -gt 0 }).Count
                            }
                        }
                        if ($totalLines -gt 0) {
                            $result.Coverage = [Math]::Round(($coveredLines / $totalLines) * 100, 1)
                        }
                    }
                    
                    # Calculer le score
                    if ($result.TestsTotal -gt 0) {
                        $passRate = ($result.TestsPassed / $result.TestsTotal) * 10
                        $coverageScore = ($result.Coverage / 100) * 3
                        $result.Score = [Math]::Round($passRate + $coverageScore, 1)
                    }
                }
            }
        } catch {
            Write-Info "  Erreur parsing Jest: $($_.Exception.Message)"
        }
    } catch {
        Write-Info "  Erreur Jest: $($_.Exception.Message)"
    }
    
    return $result
}

# Fonction pour exécuter npm audit et parser les résultats
function Invoke-NpmAuditAnalysis {
    param([string]$ProjectRoot)
    
    $result = @{
        Success = $false
        Vulnerabilities = 0
        Critical = 0
        High = 0
        Moderate = 0
        Low = 0
        Score = 10
        Outdated = @()
    }
    
    try {
        if (-not (Test-Path (Join-Path $ProjectRoot "package.json"))) {
            Write-Info "  package.json non trouvé, npm audit ignoré"
            return $result
        }
        
        Write-Info "  Exécution npm audit..."
        $auditOutput = & npm audit --json 2>&1 | Out-String
        
        # Parser le JSON npm audit
        try {
            $jsonStart = $auditOutput.IndexOf('{')
            $jsonEnd = $auditOutput.LastIndexOf('}')
            if ($jsonStart -ge 0 -and $jsonEnd -gt $jsonStart) {
                $jsonContent = $auditOutput.Substring($jsonStart, $jsonEnd - $jsonStart + 1)
                $auditResults = $jsonContent | ConvertFrom-Json
                
                if ($auditResults -and $auditResults.metadata) {
                    $result.Success = $true
                    $result.Vulnerabilities = $auditResults.metadata.vulnerabilities.total
                    $result.Critical = $auditResults.metadata.vulnerabilities.critical
                    $result.High = $auditResults.metadata.vulnerabilities.high
                    $result.Moderate = $auditResults.metadata.vulnerabilities.moderate
                    $result.Low = $auditResults.metadata.vulnerabilities.low
                    
                    # Calculer le score (10 - critical*2 - high*1 - moderate*0.5 - low*0.1)
                    $result.Score = [Math]::Max(0, 10 - ($result.Critical * 2) - ($result.High * 1) - ($result.Moderate * 0.5) - ($result.Low * 0.1))
                }
            }
        } catch {
            # Si le parsing échoue, vérifier si npm audit a trouvé des vulnérabilités
            if ($auditOutput -match "found \d+ vulnerabilities") {
                $result.Vulnerabilities = 1
                $result.Score = 8
            }
        }
        
        # Vérifier les versions obsolètes des dépendances critiques
        Write-Info "  Vérification versions obsolètes des dépendances critiques..."
        try {
            $packageJsonPath = Join-Path $ProjectRoot "package.json"
            $packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
            
            # Dépendances critiques à vérifier (Next.js, React, React DOM)
            $criticalPackages = @("next", "react", "react-dom")
            $outdatedPackages = @()
            
            foreach ($pkg in $criticalPackages) {
                $currentVersion = $null
                $latestVersion = $null
                
                # Récupérer la version actuelle depuis package.json
                if ($packageJson.dependencies -and $packageJson.dependencies.PSObject.Properties.Name -contains $pkg) {
                    $currentVersionRaw = $packageJson.dependencies.$pkg
                    # Enlever ^, ~, et autres préfixes
                    $currentVersion = $currentVersionRaw -replace '[\^~>=<]', '' -replace '\s.*$', ''
                } elseif ($packageJson.devDependencies -and $packageJson.devDependencies.PSObject.Properties.Name -contains $pkg) {
                    $currentVersionRaw = $packageJson.devDependencies.$pkg
                    $currentVersion = $currentVersionRaw -replace '[\^~>=<]', '' -replace '\s.*$', ''
                }
                
                if ($currentVersion -and $currentVersion -match '^\d+\.\d+\.\d+') {
                    try {
                        # Récupérer la dernière version via npm view (sans installer)
                        $npmViewOutput = & npm view $pkg version --json 2>&1 | Out-String
                        $npmViewOutput = $npmViewOutput.Trim() -replace '"', '' -replace '\s', ''
                        
                        if ($npmViewOutput -match '^\d+\.\d+\.\d+') {
                            $latestVersion = $npmViewOutput
                            
                            # Comparer les versions (simple comparaison de strings pour les versions sémantiques)
                            if ($latestVersion -and $currentVersion -ne $latestVersion) {
                                # Vérifier si c'est une mise à jour majeure, mineure ou patch
                                $currentParts = $currentVersion -split '\.'
                                $latestParts = $latestVersion -split '\.'
                                
                                if ($currentParts.Count -ge 1 -and $latestParts.Count -ge 1) {
                                    try {
                                        $currentMajor = [int]$currentParts[0]
                                        $latestMajor = [int]$latestParts[0]
                                        
                                        $isOutdated = $false
                                        $severity = "patch"
                                        
                                        if ($latestMajor -gt $currentMajor) {
                                            $isOutdated = $true
                                            $severity = "major"
                                        } elseif ($latestMajor -eq $currentMajor -and $currentParts.Count -ge 2 -and $latestParts.Count -ge 2) {
                                            $currentMinor = [int]$currentParts[1]
                                            $latestMinor = [int]$latestParts[1]
                                            if ($latestMinor -gt $currentMinor) {
                                                $isOutdated = $true
                                                $severity = "minor"
                                            } elseif ($latestMinor -eq $currentMinor -and $currentParts.Count -ge 3 -and $latestParts.Count -ge 3) {
                                                $currentPatch = [int]$currentParts[2]
                                                $latestPatch = [int]$latestParts[2]
                                                if ($latestPatch -gt $currentPatch) {
                                                    $isOutdated = $true
                                                    $severity = "patch"
                                                }
                                            }
                                        }
                                        
                                        if ($isOutdated) {
                                            $outdatedPackages += @{
                                                Package = $pkg
                                                Current = $currentVersion
                                                Latest = $latestVersion
                                                Severity = $severity
                                            }
                                            Write-Info "    $pkg : $currentVersion -> $latestVersion ($severity)"
                                        }
                                    } catch {
                                        Write-Info "    Erreur comparaison version $pkg : $($_.Exception.Message)"
                                    }
                                }
                            }
                        }
                    } catch {
                        Write-Info "    Impossible de vérifier la version de $pkg : $($_.Exception.Message)"
                    }
                }
            }
            
            $result.Outdated = $outdatedPackages
            if ($result.Outdated.Count -gt 0) {
                Write-Info "  $($result.Outdated.Count) dépendance(s) critique(s) obsolète(s) détectée(s)"
            }
        } catch {
            Write-Info "  Erreur vérification versions obsolètes: $($_.Exception.Message)"
        }
        
        $result.Success = $true
        
    } catch {
        Write-Info "  Erreur npm audit: $($_.Exception.Message)"
    }
    
    return $result
}

# Fonction pour exécuter dependency-cruiser et parser les résultats
function Invoke-DependencyCruiserAnalysis {
    param([string]$ProjectRoot)
    
    $result = @{
        Success = $false
        CircularDependencies = 0
        OrphanedModules = 0
        Issues = @()
        Score = 10
    }
    
    try {
        # Vérifier si dependency-cruiser est installé
        $depcruiseInstalled = $false
        try {
            $npmList = npm list dependency-cruiser --depth=0 2>&1
            if ($LASTEXITCODE -eq 0 -or $npmList -match "dependency-cruiser@") {
                $depcruiseInstalled = $true
            } else {
                # Essayer npx
                $npxCheck = & npx dependency-cruiser --version 2>&1
                if ($LASTEXITCODE -eq 0) {
                    $depcruiseInstalled = $true
                }
            }
        } catch {
            # Ignorer
        }
        
        if (-not $depcruiseInstalled) {
            Write-Info "  dependency-cruiser non installé (optionnel)"
            return $result
        }
        
        Write-Info "  Exécution dependency-cruiser..."
        
        # Créer un fichier temporaire pour les résultats
        $tempFile = Join-Path $env:TEMP "depcruise-$(Get-Date -Format 'yyyyMMddHHmmss').json"
        
        try {
            # Exécuter dependency-cruiser
            if (Test-Path (Join-Path $ProjectRoot "node_modules\.bin\depcruise.cmd")) {
                & (Join-Path $ProjectRoot "node_modules\.bin\depcruise.cmd") --output-type json --output $tempFile "app" "components" "hooks" "lib" 2>&1 | Out-Null
            } else {
                & npx dependency-cruiser --output-type json --output $tempFile "app" "components" "hooks" "lib" 2>&1 | Out-Null
            }
            
            if (Test-Path $tempFile) {
                $cruiseResults = Get-Content $tempFile -Raw | ConvertFrom-Json
                
                if ($cruiseResults -and $cruiseResults.summary) {
                    $result.Success = $true
                    $result.CircularDependencies = $cruiseResults.summary.circularDependencies
                    $result.OrphanedModules = $cruiseResults.summary.orphanedModules
                    
                    # Calculer le score
                    $result.Score = [Math]::Max(0, 10 - ($result.CircularDependencies * 1) - ($result.OrphanedModules * 0.5))
                }
                
                Remove-Item $tempFile -ErrorAction SilentlyContinue
            }
        } catch {
            Write-Info "  Erreur dependency-cruiser: $($_.Exception.Message)"
            if (Test-Path $tempFile) {
                Remove-Item $tempFile -ErrorAction SilentlyContinue
            }
        }
    } catch {
        Write-Info "  Erreur dependency-cruiser: $($_.Exception.Message)"
    }
    
    return $result
}

# Fonction pour exécuter jscpd et parser les résultats
function Invoke-JscpdAnalysis {
    param([string]$ProjectRoot)
    
    $result = @{
        Success = $false
        DuplicatedLines = 0
        DuplicatedFiles = 0
        Clones = @()
        Score = 10
    }
    
    try {
        # Vérifier si jscpd est installé
        $jscpdInstalled = $false
        try {
            $jscpdCheck = & jscpd --version 2>&1
            if ($LASTEXITCODE -eq 0) {
                $jscpdInstalled = $true
            } else {
                # Essayer npx
                $npxCheck = & npx jscpd --version 2>&1
                if ($LASTEXITCODE -eq 0) {
                    $jscpdInstalled = $true
                }
            }
        } catch {
            # Ignorer
        }
        
        if (-not $jscpdInstalled) {
            Write-Info "  jscpd non installé (optionnel: npm install -g jscpd)"
            return $result
        }
        
        Write-Info "  Exécution jscpd..."
        
        # Créer un fichier temporaire pour les résultats
        $tempFile = Join-Path $env:TEMP "jscpd-$(Get-Date -Format 'yyyyMMddHHmmss').json"
        
        try {
            # Exécuter jscpd
            $jscpdCmd = if (Get-Command jscpd -ErrorAction SilentlyContinue) { "jscpd" } else { "npx jscpd" }
            & $jscpdCmd --format json --reporters json --output $tempFile --min-lines 5 --min-tokens 50 "app" "components" "hooks" "lib" 2>&1 | Out-Null
            
            if (Test-Path $tempFile) {
                $jscpdResults = Get-Content $tempFile -Raw | ConvertFrom-Json
                
                if ($jscpdResults -and $jscpdResults.percentage) {
                    $result.Success = $true
                    $result.DuplicatedLines = $jscpdResults.percentage
                    $result.DuplicatedFiles = $jscpdResults.clones.Count
                    
                    # Calculer le score (10 - pourcentage de duplication)
                    $result.Score = [Math]::Max(0, 10 - ($result.DuplicatedLines / 10))
                }
                
                Remove-Item $tempFile -ErrorAction SilentlyContinue
            }
        } catch {
            Write-Info "  Erreur jscpd: $($_.Exception.Message)"
            if (Test-Path $tempFile) {
                Remove-Item $tempFile -ErrorAction SilentlyContinue
            }
        }
    } catch {
        Write-Info "  Erreur jscpd: $($_.Exception.Message)"
    }
    
    return $result
}

# Fonction pour exécuter PHPStan et parser les résultats
function Invoke-PHPStanAnalysis {
    param([string]$ProjectRoot)
    
    $result = @{
        Success = $false
        Errors = 0
        Issues = @()
        Score = 10
    }
    
    try {
        # Vérifier si PHPStan est installé
        $phpstanPath = $null
        if (Test-Path (Join-Path $ProjectRoot "vendor\bin\phpstan.bat")) {
            $phpstanPath = Join-Path $ProjectRoot "vendor\bin\phpstan.bat"
        } elseif (Test-Path (Join-Path $ProjectRoot "vendor\bin\phpstan")) {
            $phpstanPath = Join-Path $ProjectRoot "vendor\bin\phpstan"
        } elseif (Get-Command phpstan -ErrorAction SilentlyContinue) {
            $phpstanPath = "phpstan"
        }
        
        if (-not $phpstanPath) {
            Write-Info "  PHPStan non installé (optionnel: composer require --dev phpstan/phpstan)"
            return $result
        }
        
        Write-Info "  Exécution PHPStan..."
        
        try {
            # Exécuter PHPStan avec format JSON
            $phpstanOutput = & $phpstanPath analyse --error-format json "api" 2>&1 | Out-String
            
            # Parser le JSON PHPStan
            try {
                $jsonStart = $phpstanOutput.IndexOf('[')
                $jsonEnd = $phpstanOutput.LastIndexOf(']')
                if ($jsonStart -ge 0 -and $jsonEnd -gt $jsonStart) {
                    $jsonContent = $phpstanOutput.Substring($jsonStart, $jsonEnd - $jsonStart + 1)
                    $phpstanResults = $jsonContent | ConvertFrom-Json
                    
                    if ($phpstanResults) {
                        $result.Success = $true
                        $result.Errors = $phpstanResults.Count
                        
                        foreach ($issue in $phpstanResults | Select-Object -First 10) {
                            $result.Issues += "$($issue.path):$($issue.line): $($issue.message)"
                        }
                        
                        # Calculer le score
                        $result.Score = [Math]::Max(0, 10 - ($result.Errors * 0.2))
                    }
                }
            } catch {
                # Si le parsing échoue, compter les erreurs dans la sortie
                if ($phpstanOutput -match "errors") {
                    $result.Errors = 1
                    $result.Score = 8
                }
            }
        } catch {
            Write-Info "  Erreur PHPStan: $($_.Exception.Message)"
        }
    } catch {
        Write-Info "  Erreur PHPStan: $($_.Exception.Message)"
    }
    
    return $result
}

# Fonction pour exécuter PSScriptAnalyzer et parser les résultats
function Invoke-PSScriptAnalyzerAnalysis {
    param([string]$ProjectRoot)
    
    $result = @{
        Success = $false
        Errors = 0
        Warnings = 0
        Issues = @()
        Score = 10
    }
    
    try {
        # Vérifier si PSScriptAnalyzer est installé
        $psaModule = Get-Module -ListAvailable -Name PSScriptAnalyzer
        if (-not $psaModule) {
            Write-Info "  PSScriptAnalyzer non installé (optionnel: Install-Module -Name PSScriptAnalyzer)"
            return $result
        }
        
        Write-Info "  Exécution PSScriptAnalyzer..."
        
        try {
            Import-Module PSScriptAnalyzer -ErrorAction SilentlyContinue
            
            # Analyser les scripts PowerShell du projet
            $ps1Files = Get-ChildItem -Path $ProjectRoot -Recurse -Filter "*.ps1" | Where-Object {
                $_.FullName -notmatch 'node_modules' -and
                $_.FullName -notmatch '\\\.git\\' -and
                $_.FullName -notmatch '\\vendor\\'
            }
            
            $allIssues = @()
            foreach ($file in $ps1Files) {
                try {
                    $fileIssues = Invoke-ScriptAnalyzer -Path $file.FullName -ErrorAction SilentlyContinue
                    if ($fileIssues) {
                        $allIssues += $fileIssues
                    }
                } catch {
                    # Ignorer les erreurs sur un fichier spécifique
                }
            }
            
            if ($allIssues) {
                $result.Success = $true
                $result.Errors = ($allIssues | Where-Object { $_.Severity -eq 'Error' }).Count
                $result.Warnings = ($allIssues | Where-Object { $_.Severity -eq 'Warning' }).Count
                
                foreach ($issue in $allIssues | Select-Object -First 10) {
                    $result.Issues += "$($issue.ScriptName):$($issue.Line): $($issue.Message)"
                }
                
                # Calculer le score
                $result.Score = [Math]::Max(0, 10 - ($result.Errors * 0.5) - ($result.Warnings * 0.1))
            }
        } catch {
            Write-Info "  Erreur PSScriptAnalyzer: $($_.Exception.Message)"
        }
    } catch {
        Write-Info "  Erreur PSScriptAnalyzer: $($_.Exception.Message)"
    }
    
    return $result
}

