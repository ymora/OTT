# ===============================================================================
# VÉRIFICATION : INVENTAIRE EXHAUSTIF
# ===============================================================================
# Inventaire complet de tous les fichiers du projet

function Invoke-Check-Inventory {
    param(
        [Parameter(Mandatory=$true)]
        [hashtable]$Config,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Results,
        
        [Parameter(Mandatory=$false)]
        [hashtable]$ProjectInfo = @{}
    )
    
    Write-Section "[1/23] Inventaire Exhaustif - Tous les Fichiers et Répertoires"
    
    try {
        Write-Info "Parcours exhaustif de tous les fichiers..."
        
        # Fonction helper pour exclure les fichiers
        function Test-ExcludedFile {
            param([string]$FilePath)
            $excluded = @('node_modules', '.next', 'dist', 'build', '.git', 'out', 'docs/_next', 'docs/.next', 'vendor', '.venv')
            foreach ($exclude in $excluded) {
                if ($FilePath -match [regex]::Escape($exclude)) {
                    return $true
                }
            }
            return $false
        }
        
        # Parcourir TOUS les fichiers du projet (sauf exclusions build/cache)
        $allFiles = @(Get-ChildItem -Recurse -File | Where-Object {
            -not (Test-ExcludedFile $_.FullName)
        })
        
        # Catégoriser tous les fichiers
        $fileInventory = @{
            JS = @()
            JSX = @()
            PHP = @()
            SQL = @()
            MD = @()
            HTML = @()
            CSS = @()
            JSON = @()
            YAML = @()
            YML = @()
            SH = @()
            PS1 = @()
            INO = @()
            H = @()
            TPP = @()
            STL = @()
            PDF = @()
            PNG = @()
            JPG = @()
            SVG = @()
            WOFF2 = @()
            CONFIG = @()
            OTHER = @()
        }
        
        foreach ($file in $allFiles) {
            $ext = $file.Extension.ToLower()
            $name = $file.Name.ToLower()
            
            switch ($ext) {
                '.js' { if ($name -notmatch '\.test\.|\.spec\.') { $fileInventory.JS += $file } }
                '.jsx' { $fileInventory.JSX += $file }
                '.php' { $fileInventory.PHP += $file }
                '.sql' { $fileInventory.SQL += $file }
                '.md' { $fileInventory.MD += $file }
                '.html' { $fileInventory.HTML += $file }
                '.css' { $fileInventory.CSS += $file }
                '.json' { $fileInventory.JSON += $file }
                '.yaml' { $fileInventory.YAML += $file }
                '.yml' { $fileInventory.YML += $file }
                '.sh' { $fileInventory.SH += $file }
                '.ps1' { $fileInventory.PS1 += $file }
                '.ino' { $fileInventory.INO += $file }
                '.h' { $fileInventory.H += $file }
                '.tpp' { $fileInventory.TPP += $file }
                '.stl' { $fileInventory.STL += $file }
                '.pdf' { $fileInventory.PDF += $file }
                '.png' { $fileInventory.PNG += $file }
                '.jpg' { $fileInventory.JPG += $file }
                '.jpeg' { $fileInventory.JPG += $file }
                '.svg' { $fileInventory.SVG += $file }
                '.woff2' { $fileInventory.WOFF2 += $file }
                default {
                    if ($name -match 'config|\.env|dockerfile|makefile') {
                        $fileInventory.CONFIG += $file
                    } else {
                        $fileInventory.OTHER += $file
                    }
                }
            }
        }
        
        Write-Host "  Total fichiers analysés: $($allFiles.Count)" -ForegroundColor White
        Write-Host "  JavaScript: $($fileInventory.JS.Count + $fileInventory.JSX.Count)" -ForegroundColor White
        Write-Host "  PHP: $($fileInventory.PHP.Count)" -ForegroundColor White
        Write-Host "  SQL: $($fileInventory.SQL.Count)" -ForegroundColor White
        Write-Host "  Markdown: $($fileInventory.MD.Count)" -ForegroundColor White
        Write-Host "  HTML: $($fileInventory.HTML.Count)" -ForegroundColor White
        Write-Host "  Config (JSON/YAML/ENV): $($fileInventory.JSON.Count + $fileInventory.YAML.Count + $fileInventory.YML.Count + $fileInventory.CONFIG.Count)" -ForegroundColor White
        Write-Host "  Scripts (PS1/SH): $($fileInventory.PS1.Count + $fileInventory.SH.Count)" -ForegroundColor White
        Write-Host "  Firmware (INO/H/TPP): $($fileInventory.INO.Count + $fileInventory.H.Count + $fileInventory.TPP.Count)" -ForegroundColor White
        Write-Host "  Assets (Images/Fonts): $($fileInventory.PNG.Count + $fileInventory.JPG.Count + $fileInventory.SVG.Count + $fileInventory.WOFF2.Count)" -ForegroundColor White
        if ($fileInventory.OTHER.Count -gt 0) {
            Write-Host "  Autres: $($fileInventory.OTHER.Count)" -ForegroundColor Yellow
            Write-Info "Types autres fichiers: $(($fileInventory.OTHER | ForEach-Object { $_.Extension } | Group-Object | Select-Object -First 5 | ForEach-Object { "$($_.Name):$($_.Count)" }) -join ', ')"
        }
        
        # Stocker l'inventaire pour les phases suivantes
        $script:fileInventory = $fileInventory
        $script:allFiles = $allFiles
        
        # Stocker dans Results pour utilisation par d'autres phases
        if (-not $Results.Statistics) {
            $Results.Statistics = @{}
        }
        $Results.Statistics["Inventory"] = @{
            TotalFiles = $allFiles.Count
            FileInventory = $fileInventory
        }
        
        Write-OK "Inventaire exhaustif terminé"
        $Results.Scores["Inventory"] = 10
    } catch {
        Write-Err "Erreur inventaire: $($_.Exception.Message)"
        $Results.Scores["Inventory"] = 5
    }
}

