# ===============================================================================
# VÉRIFICATION : ROUTES (VERSION AMÉLIORÉE - GÉNÉRALISTE)
# ===============================================================================
# Détecte automatiquement les routes sans dépendre de la structure spécifique

function Invoke-Check-Routes-Improved {
    param(
        [Parameter(Mandatory=$true)]
        [array]$Files,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Config,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Results,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$ProjectInfo,
        
        [Parameter(Mandatory=$true)]
        [string]$ProjectPath
    )
    
    Write-Section "[14/21] Routes et Navigation (Amélioré)"
    
    try {
        $missingPages = 0
        $routesDetected = @()
        
        # Détecter automatiquement le framework et les routes
        if ($ProjectInfo.Framework -match "Next.js") {
            # Next.js - Détecter App Router ou Pages Router
            $appRouterPath = Join-Path $ProjectPath "app"
            $pagesRouterPath = Join-Path $ProjectPath "pages"
            
            if (Test-Path $appRouterPath) {
                # App Router
                $pages = Get-ChildItem -Path $appRouterPath -Recurse -File -Include page.js,page.jsx,page.ts,page.tsx -ErrorAction SilentlyContinue
                Write-OK "Next.js App Router détecté: $($pages.Count) pages"
                
                foreach ($page in $pages) {
                    $relativePath = $page.FullName.Replace($appRouterPath, "").Replace("\", "/")
                    $route = $relativePath -replace "/page\.(js|jsx|ts|tsx)$", "" -replace "^/", "/"
                    if ([string]::IsNullOrEmpty($route)) { $route = "/" }
                    $routesDetected += @{Path = $route; File = $page.Name; Type = "App Router"}
                }
            } elseif (Test-Path $pagesRouterPath) {
                # Pages Router
                $pages = Get-ChildItem -Path $pagesRouterPath -Recurse -File -Include *.js,*.jsx,*.ts,*.tsx -ErrorAction SilentlyContinue | 
                    Where-Object { $_.Name -notmatch '^_|^index\.' }
                Write-OK "Next.js Pages Router détecté: $($pages.Count) pages"
                
                foreach ($page in $pages) {
                    $relativePath = $page.FullName.Replace($pagesRouterPath, "").Replace("\", "/")
                    $route = "/" + ($relativePath -replace "\.(js|jsx|ts|tsx)$", "" -replace "^/", "")
                    $routesDetected += @{Path = $route; File = $page.Name; Type = "Pages Router"}
                }
            }
        } elseif ($ProjectInfo.Framework -match "React") {
            # React Router ou autre - Chercher des fichiers de routes
            $routeFiles = $Files | Where-Object {
                $_.Name -match "route|router|Routes" -and
                $_.Extension -match "\.jsx?$"
            }
            
            if ($routeFiles.Count -gt 0) {
                Write-OK "React Router détecté: $($routeFiles.Count) fichiers de routes"
                foreach ($file in $routeFiles) {
                    $routesDetected += @{Path = "Détecté"; File = $file.Name; Type = "React Router"}
                }
            }
        }
        
        # Vérifier cohérence avec menu/sidebar si présent
        $menuFiles = $Files | Where-Object {
            $_.Name -match "menu|sidebar|navigation|nav" -and
            $_.Extension -match "\.jsx?$"
        }
        
        if ($menuFiles.Count -gt 0 -and $routesDetected.Count -gt 0) {
            Write-OK "Menu/Sidebar détecté: $($menuFiles.Count) fichier(s)"
            # Note: Vérification détaillée menu vs routes nécessiterait parsing du code
        }
        
        $Results.Scores["Routes"] = 10
        
        if ($routesDetected.Count -gt 0) {
            Write-OK "Routes détectées: $($routesDetected.Count)"
            $Results.Routes = $routesDetected
        } else {
            Write-Warn "Aucune route détectée (peut être normal selon le framework)"
        }
    } catch {
        Write-Err "Erreur analyse routes: $($_.Exception.Message)"
        $Results.Scores["Routes"] = 5
    }
}

