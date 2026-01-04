# ===============================================================================
# DÉTECTION AUTOMATIQUE DU TYPE DE PROJET
# ===============================================================================

function Get-ProjectInfo {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Path
    )
    
    $info = @{
        Name = (Split-Path -Leaf $Path)
        Type = "Unknown"
        Framework = "Unknown"
        Version = $null
        Language = @()
        HasBackend = $false
        HasFrontend = $false
        PackageManager = $null
    }
    
    # Détecter package.json (Node.js/React)
    if (Test-Path (Join-Path $Path "package.json")) {
        try {
            $package = Get-Content (Join-Path $Path "package.json") -Raw | ConvertFrom-Json
            $info.Language += "JavaScript"
            $info.Version = $package.version
            $info.PackageManager = "npm"
            
            # Détecter React/Next.js
            $depsList = @()
            if ($package.dependencies) { $depsList += $package.dependencies.PSObject.Properties }
            if ($package.devDependencies) { $depsList += $package.devDependencies.PSObject.Properties }
            
            foreach ($dep in $depsList) {
                $name = $dep.Name
                $version = $dep.Value
                
                if ($name -eq "react") {
                    $info.HasFrontend = $true
                    if ($info.Type -ne "React") {
                        $info.Type = "React"
                        $info.Framework = "React"
                        $info.FrameworkVersion = $version
                    }
                }
                
                if ($name -eq "next") {
                    $info.HasFrontend = $true
                    $info.Type = "React"
                    $info.Framework = "Next.js"
                    $info.FrameworkVersion = $version
                }
                
                if ($name -eq "express") {
                    $info.HasBackend = $true
                    if ($info.Type -notmatch "React") {
                        $info.Type = "Node.js"
                        $info.Framework = "Express"
                    }
                }
            }
        } catch {
            Write-Warn "Erreur lecture package.json: $($_.Exception.Message)"
        }
    }
    
    # Détecter composer.json (PHP)
    if (Test-Path (Join-Path $Path "composer.json")) {
        try {
            $composer = Get-Content (Join-Path $Path "composer.json") -Raw | ConvertFrom-Json
            $info.Language += "PHP"
            $info.HasBackend = $true
            $info.PackageManager = "composer"
            
            if ($info.Type -notmatch "React") {
                $info.Type = "PHP"
                
                $deps = if ($composer.require) { $composer.require.PSObject.Properties } else { @() }
                foreach ($dep in $deps) {
                    if ($dep.Name -match "laravel/framework") {
                        $info.Framework = "Laravel"
                        break
                    }
                    if ($dep.Name -match "symfony/symfony") {
                        $info.Framework = "Symfony"
                        break
                    }
                }
                
                if ($info.Framework -eq "Unknown") {
                    $info.Framework = "PHP API"
                }
            }
        } catch {
            Write-Warn "Erreur lecture composer.json: $($_.Exception.Message)"
        }
    }
    
    # Détecter requirements.txt (Python)
    if (Test-Path (Join-Path $Path "requirements.txt")) {
        $info.Language += "Python"
        $info.HasBackend = $true
        $info.PackageManager = "pip"
        if ($info.Type -notmatch "React|PHP|Node") {
            $info.Type = "Python"
        }
    }
    
    # Détecter structure Next.js
    if ((Test-Path (Join-Path $Path "app")) -or (Test-Path (Join-Path $Path "pages"))) {
        if ($info.Framework -eq "Next.js") {
            if (Test-Path (Join-Path $Path "app")) {
                $info.Framework = "Next.js App Router"
            } else {
                $info.Framework = "Next.js Pages Router"
            }
        }
    }
    
    # Détecter si c'est un projet mixte
    if ($info.HasFrontend -and $info.HasBackend -and $info.Type -eq "React") {
        if ((Test-Path (Join-Path $Path "api.php")) -or (Test-Path (Join-Path $Path "api"))) {
            $info.Type = "React + PHP API"
        }
    }
    
    return $info
}

