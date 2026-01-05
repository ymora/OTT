# ===============================================================================
# VÉRIFICATION : ARCHITECTURE ET STATISTIQUES (VERSION AMÉLIORÉE - GÉNÉRALISTE)
# ===============================================================================
# Détecte automatiquement la structure du projet sans chemins fixes

function Invoke-Check-Architecture {
    param(
        [Parameter(Mandatory=$true)]
        [array]$Files,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Config,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Results,
        
        [Parameter(Mandatory=$true)]
        [string]$ProjectPath
    )
    
    Write-PhaseSection -PhaseNumber 2 -Title "Architecture et Statistiques"
    
    try {
        Write-Info "Comptage des fichiers..."
        
        $jsFiles = $Files | Where-Object { $_.Extension -match "\.jsx?$" }
        $phpFiles = $Files | Where-Object { $_.Extension -eq ".php" }
        $sqlFiles = Get-ChildItem -Recurse -File -Include *.sql -ErrorAction SilentlyContinue | Where-Object {
            $_.FullName -notmatch 'node_modules|vendor|\.next'
        }
        $mdFilesRoot = Get-ChildItem -Path $ProjectPath -File -Filter *.md -ErrorAction SilentlyContinue
        
        # Détecter structure automatiquement (générique)
        $components = @()
        $hooks = @()
        $pages = @()
        $scripts = @()
        $libs = @()
        
        # Détecter répertoires de composants (patterns génériques)
        $componentDirs = @("components", "Components", "src/components", "app/components", "lib/components")
        foreach ($dir in $componentDirs) {
            $fullPath = Join-Path $ProjectPath $dir
            if (Test-Path $fullPath) {
                $components += Get-ChildItem -Path $fullPath -Recurse -File -Include *.js,*.jsx,*.ts,*.tsx -ErrorAction SilentlyContinue
                break  # Prendre le premier trouvé
            }
        }
        
        # Détecter répertoires de hooks (patterns génériques)
        $hookDirs = @("hooks", "Hooks", "src/hooks", "app/hooks", "lib/hooks")
        foreach ($dir in $hookDirs) {
            $fullPath = Join-Path $ProjectPath $dir
            if (Test-Path $fullPath) {
                $hooks += Get-ChildItem -Path $fullPath -File -Include *.js,*.ts -Exclude index.js,index.ts -ErrorAction SilentlyContinue
                break
            }
        }
        
        # Détecter répertoires de pages (Next.js, React Router, etc.)
        $pageDirs = @("app", "pages", "src/pages", "src/app", "src/routes")
        foreach ($dir in $pageDirs) {
            $fullPath = Join-Path $ProjectPath $dir
            if (Test-Path $fullPath) {
                # App Router (Next.js 13+)
                if ($dir -eq "app") {
                    $pages += Get-ChildItem -Path $fullPath -Recurse -File -Include page.js,page.jsx,page.ts,page.tsx -ErrorAction SilentlyContinue
                } else {
                    # Pages Router ou autres
                    $pages += Get-ChildItem -Path $fullPath -Recurse -File -Include *.js,*.jsx,*.ts,*.tsx -ErrorAction SilentlyContinue | 
                        Where-Object { $_.Name -notmatch '^_|^index\.' }
                }
                break
            }
        }
        
        # Détecter répertoires de scripts (patterns génériques)
        $scriptDirs = @("scripts", "Scripts", "bin", "tools", "scripts")
        foreach ($dir in $scriptDirs) {
            $fullPath = Join-Path $ProjectPath $dir
            if (Test-Path $fullPath) {
                $scripts += Get-ChildItem -Path $fullPath -Recurse -File -Include *.ps1,*.sh,*.js,*.py -ErrorAction SilentlyContinue
                break
            }
        }
        
        # Détecter répertoires de libs (patterns génériques)
        $libDirs = @("lib", "Lib", "src/lib", "utils", "helpers")
        foreach ($dir in $libDirs) {
            $fullPath = Join-Path $ProjectPath $dir
            if (Test-Path $fullPath) {
                $libs += Get-ChildItem -Path $fullPath -File -Include *.js,*.ts -ErrorAction SilentlyContinue
                break
            }
        }
        
        # Compter lignes (OPTIMISATION: Échantillonnage pour gros projets - max 50 fichiers)
        $jsLines = 0
        $jsFilesToCount = if ($jsFiles.Count -gt 50) { 
            Write-Info "Échantillonnage: $($jsFiles.Count) fichiers JS -> 50 fichiers pour comptage"
            $jsFiles | Select-Object -First 50 
        } else { 
            $jsFiles 
        }
        foreach ($file in $jsFilesToCount) {
            try { 
                $lines = (Get-Content $file.FullName -ErrorAction SilentlyContinue -TotalCount 10000 | Measure-Object -Line).Lines
                $jsLines += $lines
            } catch {}
        }
        # Estimer le total si échantillonnage
        if ($jsFiles.Count -gt 50) {
            $avgLines = if ($jsFilesToCount.Count -gt 0) { $jsLines / $jsFilesToCount.Count } else { 0 }
            $jsLines = [Math]::Round($avgLines * $jsFiles.Count)
            Write-Info "Lignes JS estimées: $jsLines (basé sur échantillon de $($jsFilesToCount.Count) fichiers)"
        }
        
        $phpLines = 0
        $phpFilesToCount = if ($phpFiles.Count -gt 30) { 
            Write-Info "Échantillonnage: $($phpFiles.Count) fichiers PHP -> 30 fichiers pour comptage"
            $phpFiles | Select-Object -First 30 
        } else { 
            $phpFiles 
        }
        foreach ($file in $phpFilesToCount) {
            try { 
                $lines = (Get-Content $file.FullName -ErrorAction SilentlyContinue -TotalCount 10000 | Measure-Object -Line).Lines
                $phpLines += $lines
            } catch {}
        }
        # Estimer le total si échantillonnage
        if ($phpFiles.Count -gt 30) {
            $avgLines = if ($phpFilesToCount.Count -gt 0) { $phpLines / $phpFilesToCount.Count } else { 0 }
            $phpLines = [Math]::Round($avgLines * $phpFiles.Count)
            Write-Info "Lignes PHP estimées: $phpLines (basé sur échantillon de $($phpFilesToCount.Count) fichiers)"
        }
        
        $stats = @{
            JS = $jsFiles.Count
            JSLines = $jsLines
            PHP = $phpFiles.Count
            PHPLines = $phpLines
            SQL = $sqlFiles.Count
            MD = $mdFilesRoot.Count
            Components = $components.Count
            Hooks = $hooks.Count
            Pages = $pages.Count
            Scripts = $scripts.Count
            Libs = $libs.Count
        }
        
        Write-Host "  JavaScript/React : $($stats.JS) fichiers ($($stats.JSLines) lignes)" -ForegroundColor White
        if ($stats.PHP -gt 0) {
            Write-Host "  PHP              : $($stats.PHP) fichiers ($($stats.PHPLines) lignes)" -ForegroundColor White
        }
        if ($stats.SQL -gt 0) {
            Write-Host "  SQL              : $($stats.SQL) fichiers" -ForegroundColor White
        }
        Write-Host "  Markdown root    : $($stats.MD) fichiers" -ForegroundColor $(if($stats.MD -gt 10){"Red"}elseif($stats.MD -gt 5){"Yellow"}else{"Green"})
        if ($stats.Components -gt 0) {
            Write-Host "  Composants       : $($stats.Components)" -ForegroundColor White
        }
        if ($stats.Hooks -gt 0) {
            Write-Host "  Hooks            : $($stats.Hooks)" -ForegroundColor White
        }
        if ($stats.Pages -gt 0) {
            Write-Host "  Pages            : $($stats.Pages)" -ForegroundColor White
        }
        if ($stats.Scripts -gt 0) {
            Write-Host "  Scripts          : $($stats.Scripts)" -ForegroundColor White
        }
        if ($stats.Libs -gt 0) {
            Write-Host "  Libs             : $($stats.Libs)" -ForegroundColor White
        }
        
        $Results.Stats = $stats
        $Results.Scores["Architecture"] = 10
        
        # Générer contexte pour l'IA si nécessaire
        $aiContext = @()
        if ($stats.MD -gt 10) {
            Write-Warn "Trop de fichiers MD à la racine ($($stats.MD)) - Recommande <= 5"
            $Results.Issues += @{
                Type = "organization"
                Severity = "low"
                Description = "Trop de fichiers MD à la racine: $($stats.MD) (recommandé <= 5)"
                File = $ProjectPath
                Line = 0
            }
            $aiContext += @{
                Category = "Architecture"
                Type = "Too Many MD Files"
                Count = $stats.MD
                Recommended = 5
                Severity = "low"
                NeedsAICheck = $true
                Question = "Il y a $($stats.MD) fichiers Markdown à la racine (recommandé <= 5). Certains peuvent-ils être consolidés, déplacés dans un dossier docs/, ou supprimés s'ils sont obsolètes ?"
            }
        } else {
            Write-OK "Organisation fichiers MD OK"
        }
        
        # Sauvegarder le contexte pour l'IA
        if (-not $Results.AIContext) {
            $Results.AIContext = @{}
        }
        if ($aiContext.Count -gt 0) {
            $Results.AIContext.Architecture = @{
                Questions = $aiContext
            }
        }
    } catch {
        Write-Err "Erreur analyse architecture: $($_.Exception.Message)"
        $Results.Scores["Architecture"] = 7
    }
}

