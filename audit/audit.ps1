# ===============================================================================
# LAUNCHER PRINCIPAL - SYSTÈME D'AUDIT COMPLET
# ===============================================================================
# Programme autonome et portable pour auditer n'importe quel projet
# Usage: .\audit.ps1 [Options]
# ===============================================================================

param(
    [Parameter(Position=0)]
    [string]$ProjectPath = "",  # Chemin vers le projet à auditer (vide = détection auto)
    
    [Parameter(Position=1)]
    [string]$TargetFile = "",   # Fichier spécifique à auditer (ex: firmware.ino)
    
    [string]$Phases = "",       # Phases à exécuter (vide = menu interactif)
    [switch]$SkipMenu = $false, # Passer le menu interactif
    [switch]$All = $false,      # Exécuter toutes les phases
    [switch]$Help = $false,     # Afficher l'aide
    [switch]$Setup = $false,    # Installation/setup initial
    [switch]$Version = $false,  # Afficher la version
    [switch]$ShowVerbose = $false   # Mode verbeux pour l'audit
)

# Version du système d'audit
$AUDIT_VERSION = "3.1.0"

# Répertoire du script (audit/)
$AUDIT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$SCRIPTS_DIR = Join-Path $AUDIT_DIR "scripts"
$MODULES_DIR = Join-Path $AUDIT_DIR "modules"

# ===============================================================================
# FONCTIONS D'AFFICHAGE
# ===============================================================================

function Show-Help {
    Write-Host @"
═══════════════════════════════════════════════════════════════════════════════
  SYSTÈME D'AUDIT COMPLET - Version $AUDIT_VERSION
═══════════════════════════════════════════════════════════════════════════════

USAGE:
  .\audit.ps1 [Options] [CheminProjet] [FichierCible]

EXEMPLES:
  .\audit.ps1                          # Menu interactif (détection auto du projet)
  .\audit.ps1 -All                     # Audit complet de tous les projets trouvés
  .\audit.ps1 "C:\Projets\OTT"         # Auditer le projet OTT spécifique
  .\audit.ps1 "" "firmware.ino"        # Auditer un fichier firmware spécifique
  .\audit.ps1 -Phases "3,5,7"          # Exécuter phases 3, 5 et 7
  .\audit.ps1 -Setup                   # Installation/setup initial

OPTIONS:
  -ProjectPath <chemin>    Chemin vers le projet à auditer (vide = auto)
  -TargetFile <fichier>     Fichier spécifique à auditer (ex: firmware.ino)
  -Phases <liste>           Phases à exécuter (ex: "0,1,3" ou "A" pour tout)
  -SkipMenu                Passer le menu interactif
  -All                     Exécuter toutes les phases
  -Setup                   Installation/setup initial
  -Version                 Afficher la version
  -Help                    Afficher cette aide

PHASES DISPONIBLES:
  0-2   : Structure (Inventaire, Architecture, Organisation)
  3     : Sécurité
  4-6   : Backend (API, BDD, Structure API)
  7-13  : Qualité (Code Mort, Duplication, Complexité, Tests, etc.)
  14-16 : Frontend (Routes, Accessibilité, UI/UX)
  17    : Performance
  18    : Documentation
  19    : Déploiement
  20    : Firmware

POUR PLUS D'INFORMATIONS:
  Consultez README.md dans le répertoire audit/

═══════════════════════════════════════════════════════════════════════════════
"@ -ForegroundColor Cyan
}

function Show-Version {
    Write-Host "Système d'Audit Complet - Version $AUDIT_VERSION" -ForegroundColor Green
    Write-Host "Répertoire: $AUDIT_DIR" -ForegroundColor Gray
}

# ===============================================================================
# SETUP/INSTALLATION
# ===============================================================================

function Invoke-Setup {
    Write-Host "`n🔧 Installation/Setup du Système d'Audit..." -ForegroundColor Cyan
    Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    
    # Vérifier PowerShell version
    $psVersion = $PSVersionTable.PSVersion
    Write-Host "`n📋 Vérification des prérequis..." -ForegroundColor Yellow
    Write-Host "   PowerShell: $psVersion" -ForegroundColor White
    
    if ($psVersion.Major -lt 5) {
        Write-Host "   ⚠️  PowerShell 5.0+ recommandé" -ForegroundColor Yellow
    } else {
        Write-Host "   ✅ PowerShell version OK" -ForegroundColor Green
    }
    
    # Vérifier les modules PowerShell nécessaires
    $requiredModules = @("PSScriptAnalyzer")
    foreach ($module in $requiredModules) {
        if (Get-Module -ListAvailable -Name $module) {
            Write-Host "   ✅ Module $module installé" -ForegroundColor Green
        } else {
            Write-Host "   ⚠️  Module $module non installé (optionnel)" -ForegroundColor Yellow
            Write-Host "      Installation: Install-Module -Name $module -Scope CurrentUser" -ForegroundColor Gray
        }
    }
    
    # Créer les répertoires nécessaires
    Write-Host "`n📁 Création des répertoires..." -ForegroundColor Yellow
    $dirs = @("resultats", "plans", "data")
    foreach ($dir in $dirs) {
        $dirPath = Join-Path $AUDIT_DIR $dir
        if (-not (Test-Path $dirPath)) {
            New-Item -ItemType Directory -Path $dirPath -Force | Out-Null
            Write-Host "   ✅ Créé: $dir" -ForegroundColor Green
        } else {
            Write-Host "   ✓ Existe: $dir" -ForegroundColor Gray
        }
    }
    
    # Copier le fichier de configuration exemple si nécessaire
    $configExample = Join-Path $SCRIPTS_DIR "audit.config.example.ps1"
    $configFile = Join-Path $SCRIPTS_DIR "audit.config.ps1"
    if (-not (Test-Path $configFile) -and (Test-Path $configExample)) {
        Copy-Item $configExample $configFile
        Write-Host "`n📝 Fichier de configuration créé: scripts/audit.config.ps1" -ForegroundColor Green
        Write-Host "   ⚠️  Veuillez le configurer selon vos besoins" -ForegroundColor Yellow
    }
    
    # Vérifier les fichiers nécessaires
    Write-Host "`n📋 Vérification des fichiers..." -ForegroundColor Yellow
    $requiredFiles = @(
        "scripts\Launch-Audit.ps1",
        "scripts\Audit-Complet.ps1",
        "scripts\Audit-Phases.ps1"
    )
    $allOk = $true
    foreach ($file in $requiredFiles) {
        $filePath = Join-Path $AUDIT_DIR $file
        if (Test-Path $filePath) {
            Write-Host "   ✅ $file" -ForegroundColor Green
        } else {
            Write-Host "   ❌ $file (MANQUANT)" -ForegroundColor Red
            $allOk = $false
        }
    }
    
    if ($allOk) {
        Write-Host "`n✅ Setup terminé avec succès !" -ForegroundColor Green
        Write-Host "`n💡 Pour commencer:" -ForegroundColor Cyan
        Write-Host "   .\audit.ps1                    # Menu interactif" -ForegroundColor White
        Write-Host "   .\audit.ps1 -All              # Audit complet" -ForegroundColor White
        Write-Host "   .\audit.ps1 -Help             # Aide" -ForegroundColor White
    } else {
        Write-Host "`n⚠️  Certains fichiers sont manquants. Vérifiez l'installation." -ForegroundColor Yellow
    }
}

# ===============================================================================
# DÉTECTION DU PROJET
# ===============================================================================

function Find-Project {
    param([string]$SearchPath = "")
    
    if ([string]::IsNullOrEmpty($SearchPath)) {
        $SearchPath = Get-Location
    }
    
    # Chercher les indicateurs de projet avec logique améliorée
    $indicators = @(
        @{File = "package.json"; Weight = 3},
        @{File = "composer.json"; Weight = 3},
        @{File = "api.php"; Weight = 2},
        @{File = "next.config.js"; Weight = 2},
        @{File = ".git"; Weight = 1},
        @{File = "README.md"; Weight = 1}
    )
    
    $found = $false
    $projectPath = $SearchPath
    $maxDepth = 5
    $depth = 0
    $bestScore = 0
    $bestPath = $SearchPath
    
    while ($depth -lt $maxDepth) {
        $currentScore = 0
        foreach ($indicator in $indicators) {
            $indicatorPath = Join-Path $projectPath $indicator.File
            if (Test-Path $indicatorPath) {
                $currentScore += $indicator.Weight
            }
        }
        
        if ($currentScore -gt $bestScore) {
            $bestScore = $currentScore
            $bestPath = $projectPath
        }
        
        if ($currentScore -ge 3) {
            $found = $true
            break
        }
        
        $parent = Split-Path -Parent $projectPath
        if ($parent -eq $projectPath) {
            break
        }
        $projectPath = $parent
        $depth++
    }
    
    if ($bestScore -ge 2) {
        return $bestPath
    }
    
    return $null
}

# ===============================================================================
# EXÉCUTION PRINCIPALE
# ===============================================================================

# Aide
if ($Help) {
    Show-Help
    exit 0
}

# Version
if ($Version) {
    Show-Version
    exit 0
}

# Setup
if ($Setup) {
    Invoke-Setup
    exit 0
}

# Détecter le projet à auditer
$projectRoot = $null

if (-not [string]::IsNullOrEmpty($ProjectPath)) {
    # Chemin spécifié
    if (Test-Path $ProjectPath) {
        $projectRoot = Resolve-Path $ProjectPath
        Write-Host "📁 Projet spécifié: $projectRoot" -ForegroundColor Cyan
    } else {
        Write-Host "❌ Chemin introuvable: $ProjectPath" -ForegroundColor Red
        exit 1
    }
} else {
    # Détection automatique
    $projectRoot = Find-Project
    if ($projectRoot) {
        Write-Host "📁 Projet détecté: $projectRoot" -ForegroundColor Cyan
    } else {
        Write-Host "⚠️  Aucun projet détecté automatiquement." -ForegroundColor Yellow
        Write-Host "   Utilisez: .\audit.ps1 <chemin-projet>" -ForegroundColor Yellow
        Write-Host "   Ou: .\audit.ps1 -Help" -ForegroundColor Yellow
        exit 1
    }
}

# Changer vers le répertoire du projet
Push-Location $projectRoot

# Détecter automatiquement le projet avant de lancer l'audit
Write-Host "`n🔍 Détection automatique du projet..." -ForegroundColor Cyan
$detectScript = Join-Path $SCRIPTS_DIR "Detect-Project.ps1"
if (Test-Path $detectScript) {
    try {
        $projectMetadata = & $detectScript -ProjectRoot $projectRoot -OutputFile "project_metadata.json"
        Write-Host "✅ Projet détecté: $($projectMetadata.project.name)" -ForegroundColor Green
        Write-Host "   Type: $($projectMetadata.projectType)" -ForegroundColor Gray
        Write-Host "   Technologies: $($projectMetadata.technologies -join ', ')" -ForegroundColor Gray
    } catch {
        Write-Warning "Détection automatique échouée (continuation avec valeurs par défaut)"
    }
}

# Préparer les paramètres pour LANCER_AUDIT.ps1
$launchParams = @{
    ConfigFile = "audit.config.ps1"
    SkipMenu = $SkipMenu
}

# Gérer les phases
if ($All) {
    $launchParams.Phases = "A"
    $launchParams.SkipMenu = $true
} elseif (-not [string]::IsNullOrEmpty($Phases)) {
    $launchParams.Phases = $Phases
    $launchParams.SkipMenu = $true
}

# Si un fichier spécifique est ciblé, utiliser l'audit spécialisé
if (-not [string]::IsNullOrEmpty($TargetFile)) {
    Write-Host "📄 Fichier ciblé: $TargetFile" -ForegroundColor Cyan
    
    # Vérifier que le fichier existe
    $targetPath = Join-Path $projectRoot $TargetFile
    if (-not (Test-Path $targetPath)) {
        Write-Host "❌ Fichier introuvable: $TargetFile" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    
    # Utiliser le script unifié qui réutilise tous les modules d'audit
    # Plus efficace : un seul script qui charge les modules pertinents selon le type de fichier
    Write-Host "📄 Audit fichier unique: $TargetFile" -ForegroundColor Cyan
    
    # Résoudre le chemin du fichier (relatif ou absolu)
    $resolvedFilePath = $TargetFile
    if (-not [System.IO.Path]::IsPathRooted($TargetFile)) {
        # Chemin relatif - utiliser le chemin relatif au projet
        $resolvedFilePath = $TargetFile
    } else {
        # Chemin absolu - convertir en chemin relatif au projet si possible
        try {
            $relativePath = [System.IO.Path]::GetRelativePath($projectRoot, $TargetFile)
            if ($relativePath -notlike "..*") {
                $resolvedFilePath = $relativePath
            }
        } catch {
            # Si la conversion échoue, utiliser le chemin absolu
            $resolvedFilePath = $TargetFile
        }
    }
    
    $singleFileScript = Join-Path $SCRIPTS_DIR "Audit-SingleFile.ps1"
    if (Test-Path $singleFileScript) {
        try {
            & $singleFileScript -FilePath $resolvedFilePath -ProjectRoot $projectRoot -ShowVerbose:$ShowVerbose -AllChecks:$true
            $exitCode = $LASTEXITCODE
        } catch {
            Write-Host "`n❌ Erreur lors de l'audit du fichier: $($_.Exception.Message)" -ForegroundColor Red
            $exitCode = 1
        }
        Pop-Location
        exit $exitCode
    } else {
        Write-Host "❌ Script d'audit unifié introuvable: $singleFileScript" -ForegroundColor Red
        Write-Host "⚠️  Impossible d'effectuer l'audit du fichier" -ForegroundColor Yellow
        Pop-Location
        exit 1
    }
}

# Exécuter l'audit
$launcherScript = Join-Path $SCRIPTS_DIR "Launch-Audit.ps1"

if (-not (Test-Path $launcherScript)) {
    Write-Host "❌ Script de lancement introuvable: $launcherScript" -ForegroundColor Red
    Pop-Location
    exit 1
}

Write-Host "`n🚀 Lancement de l'audit..." -ForegroundColor Green
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Exécuter le script de lancement
try {
    & $launcherScript @launchParams
    $exitCode = $LASTEXITCODE
} catch {
    Write-Host "`n❌ Erreur lors de l'execution: $($_.Exception.Message)" -ForegroundColor Red
    $exitCode = 1
} finally {
    Pop-Location
    if ($env:AUDIT_TARGET_FILE) {
        Remove-Item Env:\AUDIT_TARGET_FILE
    }
}

exit $exitCode

