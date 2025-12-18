# ===============================================================================
# VÉRIFICATION : ARCHITECTURE ET STATISTIQUES (VERSION AMÉLIORÉE - GÉNÉRALISTE)
# ===============================================================================
# Détecte automatiquement la structure du projet sans chemins fixes

function Invoke-Check-Architecture-Improved {
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
    
    Write-Section "[1/21] Architecture et Statistiques Code (Amélioré)"
    
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
        
        # Compter lignes
        $jsLines = 0
        foreach ($file in $jsFiles) {
            try { $jsLines += (Get-Content $file.FullName -ErrorAction SilentlyContinue | Measure-Object -Line).Lines } catch {}
        }
        
        $phpLines = 0
        foreach ($file in $phpFiles) {
            try { $phpLines += (Get-Content $file.FullName -ErrorAction SilentlyContinue | Measure-Object -Line).Lines } catch {}
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
        
        if ($stats.MD -gt 10) {
            Write-Warn "Trop de fichiers MD à la racine ($($stats.MD)) - Recommande <= 5"
            $Results.Issues += @{
                Type = "organization"
                Severity = "low"
                Description = "Trop de fichiers MD à la racine: $($stats.MD) (recommandé <= 5)"
                File = $ProjectPath
                Line = 0
            }
        } else {
            Write-OK "Organisation fichiers MD OK"
        }
    } catch {
        Write-Err "Erreur analyse architecture: $($_.Exception.Message)"
        $Results.Scores["Architecture"] = 7
    }
}

