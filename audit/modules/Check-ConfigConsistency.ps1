# ===============================================================================
# MODULE AUDIT - COHÉRENCE DE CONFIGURATION
# ===============================================================================
# Vérifie que la configuration est cohérente (Docker OU Render OU Autre)
# Pas de mélange entre environnements différents
# ===============================================================================

param(
    [string]$ProjectRoot = ".",
    [switch]$Fix = $false
)

$ErrorActionPreference = "Continue"

Write-Host "`n═══════════════════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  MODULE AUDIT - COHÉRENCE DE CONFIGURATION" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════════════════════`n" -ForegroundColor Cyan

$issues = @()
$warnings = @()
$score = 10.0

# ===============================================================================
# DÉTECTION DE L'ENVIRONNEMENT CIBLE
# ===============================================================================

function Get-ConfigEnvironment {
    param([string]$file, [string]$content)
    
    $env = @{
        Docker = $false
        Render = $false
        GitHub = $false
        Local = $false
        Production = $false
        IsDocumentation = $false  # Fichier qui documente plusieurs environnements (OK)
    }
    
    # Fichiers de documentation (OK d'avoir plusieurs environnements)
    if ($file -match "README|example|\.md$|next\.config\.js|render\.yaml") {
        $env.IsDocumentation = $true
    }
    
    # Enlever les commentaires pour ne détecter que le code actif
    $activeContent = $content
    # Commentaires PHP/JS/PowerShell
    $activeContent = $activeContent -replace '(?m)^\s*//.*$', ''  # Commentaires //
    $activeContent = $activeContent -replace '(?m)^\s*#.*$', ''   # Commentaires #
    $activeContent = $activeContent -replace '/\*[\s\S]*?\*/', '' # Commentaires /* */
    
    # Détection Docker
    if ($activeContent -match "localhost:8000|localhost:3000|db:5432|ott-postgres|ott-api|ott-dashboard|docker-compose") {
        $env.Docker = $true
        $env.Local = $true
    }
    
    # Détection Render
    if ($activeContent -match "render\.com|dpg-.*\.render\.com|ott-jbln\.onrender\.com|fromDatabase") {
        $env.Render = $true
        $env.Production = $true
    }
    
    # Détection GitHub Pages
    if ($activeContent -match "github\.io|ymora\.github\.io") {
        $env.GitHub = $true
        $env.Production = $true
    }
    
    return $env
}

# ===============================================================================
# ANALYSE DES FICHIERS DE CONFIGURATION
# ===============================================================================

$configFiles = @{}
$configFilePaths = @(
    "docker-compose.yml",
    "Dockerfile",
    "Dockerfile.dashboard",
    "render.yaml",
    "env.example",
    ".env.local",
    "next.config.js",
    "api.php",
    "bootstrap/database.php"
)

$environments = @{}

Write-Host "📋 Analyse des fichiers de configuration...`n" -ForegroundColor Yellow

foreach ($file in $configFilePaths) {
    $filePath = Join-Path $ProjectRoot $file
    if (Test-Path $filePath) {
        $content = Get-Content $filePath -Raw -ErrorAction SilentlyContinue
        if ($content) {
            $configFiles[$file] = $content
            $env = Get-ConfigEnvironment -file $file -content $content
            $environments[$file] = $env
            
            $envStr = @()
            if ($env.Docker) { $envStr += "🐳 Docker" }
            if ($env.Render) { $envStr += "🚀 Render" }
            if ($env.GitHub) { $envStr += "📦 GitHub" }
            
            Write-Host "  ✓ $file" -ForegroundColor Green
            Write-Host "    → $($envStr -join ' + ')" -ForegroundColor Gray
        }
    } else {
        Write-Host "  ⚠ $file (non trouvé)" -ForegroundColor Yellow
    }
}

# ===============================================================================
# VÉRIFICATION DE LA COHÉRENCE
# ===============================================================================

Write-Host "`n🔍 Vérification de la cohérence...`n" -ForegroundColor Yellow

# Compter les environnements détectés
$dockerCount = 0
$renderCount = 0
$githubCount = 0

foreach ($env in $environments.Values) {
    if ($env.Docker) { $dockerCount++ }
    if ($env.Render) { $renderCount++ }
    if ($env.GitHub) { $githubCount++ }
}

$totalFiles = $environments.Count
Write-Host "  Fichiers analysés: $totalFiles" -ForegroundColor White
Write-Host "  Docker détecté dans: $dockerCount fichier(s)" -ForegroundColor Cyan
Write-Host "  Render détecté dans: $renderCount fichier(s)" -ForegroundColor Cyan
Write-Host "  GitHub détecté dans: $githubCount fichier(s)" -ForegroundColor Cyan

# ===============================================================================
# DÉTECTION DES INCOHÉRENCES
# ===============================================================================

Write-Host "`n⚠️  Analyse des incohérences...`n" -ForegroundColor Yellow

$hasInconsistency = $false

# Vérifier les fichiers de configuration actifs (pas la documentation)
$activeConfigFiles = $environments.Keys | Where-Object { 
    -not $environments[$_].IsDocumentation
}

# Si plusieurs environnements sont mélangés dans les fichiers ACTIFS
$dockerInActive = 0
$renderInActive = 0
$githubInActive = 0

foreach ($file in $activeConfigFiles) {
    $env = $environments[$file]
    if ($env.Docker) { $dockerInActive++ }
    if ($env.Render) { $renderInActive++ }
    if ($env.GitHub) { $githubInActive++ }
}

if (($dockerInActive -gt 0 -and $renderInActive -gt 0) -or 
    ($dockerInActive -gt 0 -and $githubInActive -gt 0) -or 
    ($renderInActive -gt 0 -and $githubInActive -gt 0)) {
    
    $hasInconsistency = $true
    $issues += "❌ INCOHÉRENCE: Mélange de configurations Docker/Render/GitHub dans les fichiers actifs"
    Write-Host "  ❌ INCOHÉRENCE MAJEURE: Mélange d'environnements dans les fichiers de configuration actifs !" -ForegroundColor Red
    $score -= 3.0
    
    # Détailler les fichiers problématiques (uniquement les fichiers actifs)
    foreach ($file in $activeConfigFiles) {
        $env = $environments[$file]
        $envCount = 0
        if ($env.Docker) { $envCount++ }
        if ($env.Render) { $envCount++ }
        if ($env.GitHub) { $envCount++ }
        
        # Fichiers actifs avec plusieurs environnements = problème
        if ($envCount -gt 1) {
            $issues += "  → $file mélange plusieurs environnements"
            Write-Host "    → $file (fichier actif)" -ForegroundColor Red
        }
    }
} else {
    Write-Host "  ✅ Aucune incohérence majeure détectée dans les fichiers actifs" -ForegroundColor Green
}

# Vérifier env.example vs fichiers Docker (uniquement si env.example est actif)
if ($environments.ContainsKey("env.example") -and $environments.ContainsKey("docker-compose.yml")) {
    $envExample = $environments["env.example"]
    $dockerCompose = $environments["docker-compose.yml"]
    
    # env.example est documentaire, donc OK d'avoir plusieurs environnements
    # On vérifie juste qu'il documente bien Docker si docker-compose.yml existe
    if (-not $envExample.Docker -and $dockerCompose.Docker) {
        $warnings += "⚠️ env.example ne documente pas Docker alors que docker-compose.yml existe"
        Write-Host "  ⚠️ env.example devrait documenter Docker" -ForegroundColor Yellow
        $score -= 0.5
    }
}

# Vérifier que render.yaml n'existe pas si on veut Docker uniquement
if (Test-Path (Join-Path $ProjectRoot "render.yaml")) {
    if ($dockerInActive -gt $renderInActive -and $renderInActive -eq 0) {
        $warnings += "⚠️ render.yaml existe mais n'est pas utilisé (projet Docker uniquement)"
        Write-Host "  ⚠️ render.yaml peut être archivé (projet Docker uniquement)" -ForegroundColor Yellow
        $score -= 0.3
    }
}

# ===============================================================================
# DÉTERMINER L'ENVIRONNEMENT PRINCIPAL
# ===============================================================================

Write-Host "`n🎯 Environnement principal détecté...`n" -ForegroundColor Yellow

$primaryEnv = "INCONNU"
if ($dockerCount -gt $renderCount -and $dockerCount -gt $githubCount) {
    $primaryEnv = "DOCKER"
    Write-Host "  → Environnement principal: 🐳 DOCKER (Local)" -ForegroundColor Cyan
} elseif ($renderCount -gt $dockerCount -and $renderCount -gt $githubCount) {
    $primaryEnv = "RENDER"
    Write-Host "  → Environnement principal: 🚀 RENDER (Production)" -ForegroundColor Cyan
} elseif ($githubCount -gt $dockerCount -and $githubCount -gt $renderCount) {
    $primaryEnv = "GITHUB"
    Write-Host "  → Environnement principal: 📦 GITHUB PAGES (Production)" -ForegroundColor Cyan
} else {
    $primaryEnv = "MIXTE"
    Write-Host "  → Environnement principal: ⚠️ MIXTE (INCOHÉRENT)" -ForegroundColor Red
    $issues += "❌ Impossible de déterminer l'environnement principal"
    $score -= 2.0
}

# ===============================================================================
# RECOMMANDATIONS DE CORRECTION
# ===============================================================================

Write-Host "`n💡 Recommandations...`n" -ForegroundColor Yellow

if ($hasInconsistency -or $primaryEnv -eq "MIXTE") {
    Write-Host "  ⚠️ CORRECTION NÉCESSAIRE: Unifier la configuration" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Options:" -ForegroundColor White
    Write-Host "    1. Tout en Docker (développement local)" -ForegroundColor Cyan
    Write-Host "       → Modifier env.example pour pointer vers localhost:8000" -ForegroundColor Gray
    Write-Host "       → Créer .env.local avec DB_HOST=localhost" -ForegroundColor Gray
    Write-Host "       → Lancer docker-compose up -d" -ForegroundColor Gray
    Write-Host ""
    Write-Host "    2. Tout en Render (production)" -ForegroundColor Cyan
    Write-Host "       → Modifier docker-compose.yml (désactiver ou supprimer)" -ForegroundColor Gray
    Write-Host "       → Configurer les variables sur Render Dashboard" -ForegroundColor Gray
    Write-Host ""
    Write-Host "    3. Séparation claire Dev/Prod" -ForegroundColor Cyan
    Write-Host "       → .env.local pour Docker (dev)" -ForegroundColor Gray
    Write-Host "       → Variables Render pour production" -ForegroundColor Gray
    Write-Host "       → env.example comme template neutre" -ForegroundColor Gray
    
    if ($Fix) {
        Write-Host "`n🔧 Mode correction activé (-Fix)...`n" -ForegroundColor Green
        Write-Host "  Uniformisation pour DOCKER en cours..." -ForegroundColor Yellow
        
        # TODO: Appliquer les corrections automatiques
        Write-Host "  ⚠️ Corrections automatiques non implémentées" -ForegroundColor Yellow
        Write-Host "  → Utilisez le script de correction manuel" -ForegroundColor Gray
    }
} else {
    Write-Host "  ✅ Configuration cohérente pour $primaryEnv" -ForegroundColor Green
}

# ===============================================================================
# RAPPORT FINAL
# ===============================================================================

Write-Host "`n" -NoNewline
Write-Host "═══════════════════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  RAPPORT FINAL" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════════════════════" -ForegroundColor Cyan

Write-Host ""
Write-Host "  Score de cohérence: " -NoNewline
if ($score -ge 9) {
    Write-Host "$score/10" -ForegroundColor Green
} elseif ($score -ge 7) {
    Write-Host "$score/10" -ForegroundColor Yellow
} else {
    Write-Host "$score/10" -ForegroundColor Red
}

Write-Host "  Environnement principal: $primaryEnv" -ForegroundColor White

if ($issues.Count -gt 0) {
    Write-Host "`n  ❌ Problèmes détectés: $($issues.Count)" -ForegroundColor Red
    foreach ($issue in $issues) {
        Write-Host "    - $issue" -ForegroundColor Red
    }
}

if ($warnings.Count -gt 0) {
    Write-Host "`n  ⚠️  Avertissements: $($warnings.Count)" -ForegroundColor Yellow
    foreach ($warning in $warnings) {
        Write-Host "    - $warning" -ForegroundColor Yellow
    }
}

if ($issues.Count -eq 0 -and $warnings.Count -eq 0) {
    Write-Host "`n  ✅ Aucun problème détecté" -ForegroundColor Green
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════════════════════" -ForegroundColor Cyan

# Retourner le résultat
return @{
    Score = $score
    PrimaryEnvironment = $primaryEnv
    Issues = $issues
    Warnings = $warnings
    IsConsistent = ($issues.Count -eq 0)
}

