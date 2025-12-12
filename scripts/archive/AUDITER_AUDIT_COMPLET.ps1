# ===============================================================================
# AUDIT DU SCRIPT D'AUDIT COMPLET AUTOMATIQUE
# ===============================================================================
# Analyse la qualité du script AUDIT_COMPLET_AUTOMATIQUE.ps1
# Usage : .\scripts\AUDITER_AUDIT_COMPLET.ps1
# ===============================================================================

$ErrorActionPreference = "Continue"

function Write-Section { param([string]$Text) Write-Host "`n=== $Text ===" -ForegroundColor Cyan }
function Write-OK { param([string]$Text) Write-Host "  [OK] $Text" -ForegroundColor Green }
function Write-Warn { param([string]$Text) Write-Host "  [WARN] $Text" -ForegroundColor Yellow }
function Write-Err { param([string]$Text) Write-Host "  [ERROR] $Text" -ForegroundColor Red }
function Write-Info { param([string]$Text) Write-Host "  [INFO] $Text" -ForegroundColor Gray }

Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "[AUDIT] Analyse du script AUDIT_COMPLET_AUTOMATIQUE.ps1" -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "Date : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host ""

$rootDir = $PSScriptRoot + "\.."
Set-Location $rootDir

$auditFile = "scripts\AUDIT_COMPLET_AUTOMATIQUE.ps1"
$score = 10.0
$issues = @()
$warnings = @()
$recommendations = @()

if (-not (Test-Path $auditFile)) {
    Write-Err "Fichier introuvable: $auditFile"
    exit 1
}

$content = Get-Content $auditFile -Raw
$lines = Get-Content $auditFile
$fileSize = (Get-Item $auditFile).Length / 1KB

Write-Section "1. Statistiques du fichier"

Write-Host "  Lignes: $($lines.Count)" -ForegroundColor White
Write-Host "  Taille: $([math]::Round($fileSize, 2)) KB" -ForegroundColor White

if ($lines.Count -gt 3500) {
    Write-Warn "Fichier très volumineux ($($lines.Count) lignes) - considérer une modularisation"
    $warnings += "Fichier très volumineux ($($lines.Count) lignes)"
    $score -= 0.5
} elseif ($lines.Count -gt 2000) {
    Write-Warn "Fichier volumineux ($($lines.Count) lignes)"
    $warnings += "Fichier volumineux ($($lines.Count) lignes)"
    $score -= 0.2
} else {
    Write-OK "Taille du fichier acceptable"
}

Write-Section "2. Analyse des fonctions"

# Extraire toutes les fonctions
$functions = [regex]::Matches($content, "function\s+(\w+)\s*\(")
$functionNames = $functions | ForEach-Object { $_.Groups[1].Value }

Write-Host "  Fonctions trouvées: $($functionNames.Count)" -ForegroundColor White
$functionNames | ForEach-Object { Write-Info "    - $_" }

# Vérifier les fonctions dupliquées
$duplicateFunctions = $functionNames | Group-Object | Where-Object { $_.Count -gt 1 }
if ($duplicateFunctions.Count -gt 0) {
    Write-Err "Fonctions dupliquées détectées:"
    $duplicateFunctions | ForEach-Object { Write-Host "      - $($_.Name) ($($_.Count) fois)" -ForegroundColor Red }
    $issues += "$($duplicateFunctions.Count) fonction(s) dupliquée(s)"
    $score -= 1.0
} else {
    Write-OK "Aucune fonction dupliquée"
}

# Vérifier les fonctions non utilisées
$unusedFunctions = @()
foreach ($func in $functionNames) {
    if ($func -ne "Write-Section" -and $func -ne "Write-OK" -and $func -ne "Write-Warn" -and $func -ne "Write-Err" -and $func -ne "Write-Info" -and $func -ne "Test-ExcludedFile") {
        # Compter les utilisations (hors définition)
        $usageCount = ([regex]::Matches($content, "\b$func\b")).Count
        if ($usageCount -le 1) {
            $unusedFunctions += $func
        }
    }
}

if ($unusedFunctions.Count -gt 0) {
    Write-Warn "Fonctions potentiellement non utilisées:"
    $unusedFunctions | ForEach-Object { Write-Host "      - $_" -ForegroundColor Yellow }
    $warnings += "$($unusedFunctions.Count) fonction(s) potentiellement non utilisée(s)"
    $score -= 0.3
} else {
    Write-OK "Toutes les fonctions sont utilisées"
}

Write-Section "3. Analyse des variables"

# Extraire les variables déclarées
$variables = [regex]::Matches($content, '\$(\w+)\s*=')

# Variables système PowerShell à ignorer
$systemVars = @('ErrorActionPreference', 'Verbose', 'LASTEXITCODE', 'PSScriptRoot', 'PSBoundParameters', 'MyInvocation', 'PWD', 'HOME', 'PSVersionTable')

# Variables déclarées mais potentiellement non utilisées
$declaredVars = $variables | ForEach-Object { $_.Groups[1].Value } | Where-Object { $systemVars -notcontains $_ } | Select-Object -Unique
$unusedVars = @()

foreach ($var in $declaredVars) {
    # Compter les utilisations (hors déclaration)
    $declarations = ([regex]::Matches($content, "\`$$var\s*=")).Count
    $usages = ([regex]::Matches($content, "\`$$var\b")).Count
    
    if ($usages -le $declarations) {
        $unusedVars += $var
    }
}

if ($unusedVars.Count -gt 0) {
    Write-Warn "Variables potentiellement non utilisées:"
    $unusedVars | Select-Object -First 10 | ForEach-Object { Write-Host "      - `$$_" -ForegroundColor Yellow }
    if ($unusedVars.Count -gt 10) {
        Write-Host "      ... et $($unusedVars.Count - 10) autres" -ForegroundColor Gray
    }
    $warnings += "$($unusedVars.Count) variable(s) potentiellement non utilisée(s)"
    $score -= 0.2
} else {
    Write-OK "Toutes les variables sont utilisées"
}

Write-Section "4. Analyse de la complexité"

# Compter les structures de contrôle
$ifCount = ([regex]::Matches($content, "\bif\s*\(")).Count
$foreachCount = ([regex]::Matches($content, "\bforeach\s*\(")).Count
$whileCount = ([regex]::Matches($content, "\bwhile\s*\(")).Count
$forCount = ([regex]::Matches($content, "\bfor\s*\(")).Count
$switchCount = ([regex]::Matches($content, "\bswitch\s*\(")).Count

$totalComplexity = $ifCount + $foreachCount + $whileCount + $forCount + $switchCount

Write-Host "  Structures de contrôle:" -ForegroundColor White
Write-Host "    - if: $ifCount" -ForegroundColor Gray
Write-Host "    - foreach: $foreachCount" -ForegroundColor Gray
Write-Host "    - while: $whileCount" -ForegroundColor Gray
Write-Host "    - for: $forCount" -ForegroundColor Gray
Write-Host "    - switch: $switchCount" -ForegroundColor Gray
Write-Host "    - Total: $totalComplexity" -ForegroundColor White

if ($totalComplexity -gt 500) {
    Write-Warn "Complexité très élevée ($totalComplexity structures de contrôle)"
    $warnings += "Complexité très élevée ($totalComplexity structures)"
    $score -= 0.5
} elseif ($totalComplexity -gt 300) {
    Write-Warn "Complexité élevée ($totalComplexity structures de contrôle)"
    $warnings += "Complexité élevée ($totalComplexity structures)"
    $score -= 0.3
} else {
    Write-OK "Complexité acceptable"
}

# Vérifier les fonctions trop longues
$longFunctions = @()
$functionBlocks = [regex]::Matches($content, "function\s+\w+\s*\([^)]*\)\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}", [System.Text.RegularExpressions.RegexOptions]::Singleline)
foreach ($match in $functionBlocks) {
    $funcContent = $match.Groups[1].Value
    $funcLines = ($funcContent -split "`n").Count
    if ($funcLines -gt 100) {
        $funcName = [regex]::Match($match.Value, "function\s+(\w+)").Groups[1].Value
        $longFunctions += @{ Name = $funcName; Lines = $funcLines }
    }
}

if ($longFunctions.Count -gt 0) {
    Write-Warn "Fonctions très longues (>100 lignes):"
    $longFunctions | ForEach-Object { Write-Host "      - $($_.Name): $($_.Lines) lignes" -ForegroundColor Yellow }
    $warnings += "$($longFunctions.Count) fonction(s) très longue(s)"
    $score -= 0.3
} else {
    Write-OK "Toutes les fonctions ont une longueur acceptable"
}

Write-Section "5. Bonnes pratiques PowerShell"

# Vérifier ErrorActionPreference
if ($content -match '\$ErrorActionPreference\s*=') {
    Write-OK "ErrorActionPreference est défini"
} else {
    Write-Warn "ErrorActionPreference non défini explicitement"
    $warnings += "ErrorActionPreference non défini"
    $score -= 0.2
}

# Vérifier les paramètres
if ($content -match "param\s*\(") {
    Write-OK "Paramètres définis avec param()"
} else {
    Write-Warn "Pas de bloc param() - considérer l'ajout de paramètres"
    $warnings += "Pas de bloc param()"
    $score -= 0.1
}

# Vérifier les commentaires d'aide
$helpComment = $content -match "# ===============================================================================" -and $content -match "Usage :"
if ($helpComment) {
    Write-OK "Commentaires d'aide présents"
} else {
    Write-Warn "Commentaires d'aide manquants ou incomplets"
    $warnings += "Commentaires d'aide manquants"
    $score -= 0.2
}

# Vérifier les try-catch
$tryCount = ([regex]::Matches($content, "\btry\s*\{")).Count
$catchCount = ([regex]::Matches($content, "\bcatch\s*\{")).Count

if ($tryCount -gt 0 -and $tryCount -eq $catchCount) {
    Write-OK "Gestion d'erreurs avec try-catch ($tryCount blocs)"
} elseif ($tryCount -gt $catchCount) {
    Write-Err "Blocs try sans catch correspondant"
    $issues += "Blocs try sans catch ($tryCount try, $catchCount catch)"
    $score -= 0.5
} else {
    Write-Warn "Peu de gestion d'erreurs explicite"
    $warnings += "Peu de gestion d'erreurs (try-catch)"
    $score -= 0.2
}

Write-Section "6. Code dupliqué"

# Rechercher les patterns répétés
$patterns = @(
    @{ Pattern = "Write-Host.*ForegroundColor.*Cyan"; Name = "Write-Host Cyan répété" },
    @{ Pattern = "Write-Host.*ForegroundColor.*Green"; Name = "Write-Host Green répété" },
    @{ Pattern = "Write-Host.*ForegroundColor.*Yellow"; Name = "Write-Host Yellow répété" },
    @{ Pattern = "Write-Host.*ForegroundColor.*Red"; Name = "Write-Host Red répété" },
    @{ Pattern = "Get-ChildItem.*-Recurse"; Name = "Get-ChildItem -Recurse répété" },
    @{ Pattern = "Select-String.*-Pattern"; Name = "Select-String -Pattern répété" }
)

$duplications = @()
foreach ($pattern in $patterns) {
    $matches = [regex]::Matches($content, $pattern.Pattern)
    if ($matches.Count -gt 20) {
        $duplications += @{ Name = $pattern.Name; Count = $matches.Count }
    }
}

if ($duplications.Count -gt 0) {
    Write-Warn "Patterns répétés détectés:"
    $duplications | ForEach-Object { Write-Host "      - $($_.Name): $($_.Count) occurrences" -ForegroundColor Yellow }
    $warnings += "$($duplications.Count) pattern(s) répété(s)"
    $score -= 0.3
    $recommendations += "Considérer créer des fonctions helper pour les patterns répétés"
} else {
    Write-OK "Pas de duplication majeure détectée"
}

Write-Section "7. Erreurs potentielles"

# Vérifier les variables non initialisées utilisées
$potentialErrors = @()

# Vérifier les appels de fonction avec paramètres manquants
$functionCalls = [regex]::Matches($content, "(\w+)\s*\([^)]*\)")
foreach ($call in $functionCalls) {
    $funcName = $call.Groups[1].Value
    if ($funcName -match "^Write-|^Test-|^Get-|^Set-|^Select-|^Invoke-|^ConvertTo-|^Join-Path|^Split-Path|^Test-Path") {
        # Fonctions système, OK
        continue
    }
    # Vérifier si la fonction est définie
    if ($functionNames -notcontains $funcName -and $funcName -notmatch "^[A-Z]") {
        # Potentiellement une erreur
        $potentialErrors += "Appel de fonction '$funcName' non définie"
    }
}

if ($potentialErrors.Count -gt 0) {
    Write-Err "Erreurs potentielles détectées:"
    $potentialErrors | Select-Object -First 5 | ForEach-Object { Write-Host "      - $_" -ForegroundColor Red }
    if ($potentialErrors.Count -gt 5) {
        Write-Host "      ... et $($potentialErrors.Count - 5) autres" -ForegroundColor Gray
    }
    $issues += "$($potentialErrors.Count) erreur(s) potentielle(s)"
    $score -= 1.0
} else {
    Write-OK "Aucune erreur potentielle détectée"
}

# Vérifier les chemins de fichiers
$filePaths = [regex]::Matches($content, '["'']([^"'']+\.(ps1|js|php|sql|md|json|html|css))["'']')
$invalidPaths = @()
foreach ($match in $filePaths) {
    $path = $match.Groups[1].Value
    # Ignorer les chemins relatifs qui commencent par . ou /
    if ($path -notmatch "^\.|^/|^\\|^scripts\\|^app\\|^components\\|^api\\|^public\\|^sql\\") {
        $invalidPaths += $path
    }
}

if ($invalidPaths.Count -gt 0) {
    Write-Warn "Chemins de fichiers suspects:"
    $invalidPaths | Select-Object -First 5 | ForEach-Object { Write-Host "      - $_" -ForegroundColor Yellow }
    $warnings += "$($invalidPaths.Count) chemin(s) de fichier suspect(s)"
    $score -= 0.2
} else {
    Write-OK "Tous les chemins de fichiers semblent valides"
}

Write-Section "8. Optimisations possibles"

# Vérifier les boucles avec Get-ChildItem -Recurse répété
$recursiveGets = [regex]::Matches($content, "Get-ChildItem.*-Recurse")
if ($recursiveGets.Count -gt 10) {
    Write-Warn "Beaucoup d'appels Get-ChildItem -Recurse ($($recursiveGets.Count))"
    $warnings += "Beaucoup d'appels Get-ChildItem -Recurse ($($recursiveGets.Count))"
    $recommendations += "Considérer mettre en cache les résultats de Get-ChildItem -Recurse"
    $score -= 0.2
}

# Vérifier les regex compilées
$regexCompiled = $content -match "\[regex\]::CompileToAssembly|\[regex\]::Options.*Compiled"
if (-not $regexCompiled -and ([regex]::Matches($content, "\[regex\]::")).Count -gt 50) {
    Write-Warn "Beaucoup d'expressions régulières non compilées"
    $warnings += "Beaucoup d'expressions régulières non compilées"
    $recommendations += "Considérer compiler les expressions régulières fréquemment utilisées"
    $score -= 0.1
}

Write-Section "9. Cohérence et style"

# Vérifier la cohérence des noms de variables
$inconsistentVars = @()
$varPatterns = [regex]::Matches($content, '\$(\w+)\s*=')
$varNames = $varPatterns | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique

# Vérifier le style camelCase vs PascalCase
$camelCase = ($varNames | Where-Object { $_ -match "^[a-z]" }).Count
$pascalCase = ($varNames | Where-Object { $_ -match "^[A-Z]" }).Count

if ($camelCase -gt 0 -and $pascalCase -gt 0) {
    Write-Warn "Style de nommage incohérent (camelCase et PascalCase mélangés)"
    $warnings += "Style de nommage incohérent"
    $score -= 0.1
} else {
    Write-OK "Style de nommage cohérent"
}

# Vérifier les commentaires
$commentLines = ($lines | Where-Object { $_ -match "^\s*#" }).Count
$commentRatio = [math]::Round(($commentLines / $lines.Count) * 100, 1)

Write-Host "  Ratio de commentaires: $commentRatio%" -ForegroundColor White

if ($commentRatio -lt 5) {
    Write-Warn "Peu de commentaires ($commentRatio%)"
    $warnings += "Peu de commentaires ($commentRatio%)"
    $score -= 0.2
} elseif ($commentRatio -gt 30) {
    Write-Warn "Trop de commentaires ($commentRatio%)"
    $warnings += "Trop de commentaires ($commentRatio%)"
    $score -= 0.1
} else {
    Write-OK "Ratio de commentaires acceptable"
}

Write-Section "10. Résumé et score"

$scoreFinal = [Math]::Max(0, [Math]::Round($score, 1))

Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "RÉSUMÉ DE L'AUDIT" -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Score final: $scoreFinal/10" -ForegroundColor $(if ($scoreFinal -ge 9) { "Green" } elseif ($scoreFinal -ge 7) { "Yellow" } else { "Red" })

if ($issues.Count -gt 0) {
    Write-Host ""
    Write-Host "Problèmes détectés ($($issues.Count)):" -ForegroundColor Red
    $issues | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
}

if ($warnings.Count -gt 0) {
    Write-Host ""
    Write-Host "Avertissements ($($warnings.Count)):" -ForegroundColor Yellow
    $warnings | Select-Object -First 10 | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
    if ($warnings.Count -gt 10) {
        Write-Host "  ... et $($warnings.Count - 10) autres" -ForegroundColor Gray
    }
}

if ($recommendations.Count -gt 0) {
    Write-Host ""
    Write-Host "Recommandations:" -ForegroundColor Cyan
    $recommendations | ForEach-Object { Write-Host "  - $_" -ForegroundColor Cyan }
}

Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host ""

if ($scoreFinal -ge 9) {
    Write-OK "Le script d'audit est de bonne qualité !"
    exit 0
} elseif ($scoreFinal -ge 7) {
    Write-Warn "Le script d'audit a quelques points à améliorer"
    exit 0
} else {
    Write-Err "Le script d'audit nécessite des corrections importantes"
    exit 1
}

