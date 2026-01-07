# ===============================================================================
# SCAN DES FICHIERS DU PROJET
# ===============================================================================

function Get-ProjectFiles {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Path,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Config
    )
    
    $files = @()
    
    # Exclusions par défaut (à ajouter aux exclusions config)
    $defaultExcludeDirs = @(
        "node_modules",
        ".next",
        "dist",
        "build",
        ".git",
        "out",
        "docs/_next",
        "docs/.next",
        ".arduino15",
        "audit/resultats",
        "resultats",
        "hardware/firmware",
        "hardware/lib",
        "firmware"
    )
    $defaultExcludeFiles = @("**/*.min.js", "**/*.bundle.js", "**/docs/_next/**", "**/out/**")
    
    $excludeDirs = $Config.Exclude.Directories + $defaultExcludeDirs
    $excludeFiles = $Config.Exclude.Files + $defaultExcludeFiles
    
    # Patterns de fichiers à analyser
    $patterns = @("*.js", "*.jsx", "*.ts", "*.tsx", "*.php", "*.py", "*.java", "*.go", "*.rs")
    
    foreach ($pattern in $patterns) {
        $found = Get-ChildItem -Path $Path -Recurse -File -Filter $pattern -ErrorAction SilentlyContinue | Where-Object {
            $shouldInclude = $true
            $fullPath = $_.FullName
            $fullPathNorm = $fullPath.Replace('/', '\')
            
            # Exclure les dossiers
            foreach ($exDir in $excludeDirs) {
                if (-not $exDir) { continue }
                $exDirNorm = ([string]$exDir).Replace('/', '\')
                if ($fullPathNorm -match [regex]::Escape($exDirNorm)) {
                    $shouldInclude = $false
                    break
                }
            }
            
            # Exclure les fichiers
            if ($shouldInclude) {
                foreach ($exFile in $excludeFiles) {
                    if ($fullPath -like $exFile) {
                        $shouldInclude = $false
                        break
                    }
                }
            }
            
            return $shouldInclude
        }
        
        $files += $found
    }
    
    return $files
}

