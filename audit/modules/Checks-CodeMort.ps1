# ===============================================================================
# VÉRIFICATION : CODE MORT (VERSION AMÉLIORÉE)
# ===============================================================================
# Détecte le code mort et génère un rapport pour l'IA
# Évite les faux positifs en détectant les imports conditionnels et dynamiques

function Invoke-Check-CodeMort {
    param(
        [Parameter(Mandatory=$true)]
        [array]$Files,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Config,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Results
    )
    
    # Si Checks n'existe pas ou DeadCode.Enabled n'est pas défini, activer par défaut
    if ($Config.Checks -and $Config.Checks.DeadCode -and $Config.Checks.DeadCode.Enabled -eq $false) {
        return
    }
    
    Write-PhaseSection -PhaseNumber 7 -Title "Code Mort"
    
    try {
        $deadCode = @{
            Components = @()
            Hooks = @()
            Libs = @()
        }
        $aiContext = @()  # Contexte pour l'IA
        
        $searchFiles = $Files | Where-Object { $_.Extension -match "\.jsx?$" }
        
        # Inclure aussi les fichiers app/ dans la recherche
        if (Test-Path "app") {
            $appFiles = Get-ChildItem -Path app -Recurse -File -Include *.js,*.jsx -ErrorAction SilentlyContinue
            $searchFiles = $searchFiles + $appFiles
        }
        
        # Analyser composants (AMÉLIORÉ - Détecte imports conditionnels)
        if (Test-Path "components") {
            Write-Info "Analyse composants avec détection imports conditionnels..."
            $allComponents = Get-ChildItem -Path components -Recurse -File -Include *.js,*.jsx -ErrorAction SilentlyContinue
            
            # Exclure les fichiers backup, old, temp, etc.
            $allComponents = $allComponents | Where-Object { 
                $_.BaseName -notmatch '_backup$|_old$|_temp$|_copy$|\.bak$|\.old$' 
            }
            
            foreach ($compFile in $allComponents) {
                $compName = $compFile.BaseName
                
                # Ignorer les hooks (use*) - ils ne sont pas utilisés en JSX
                if ($compName -match '^use[A-Z]') {
                    continue
                }
                
                $allFiles = $searchFiles + $compFile
                $allFiles = $allFiles | Where-Object { $_.FullName -ne $compFile.FullName }
                
                $importUsage = 0
                $jsxUsage = 0
                $conditionalUsage = 0
                $dynamicUsage = 0
                
                # Patterns d'imports à chercher
                $importStrings = @(
                    "from '@/components/$compName'",
                    "from '@/components/$compName.js'",
                    "from '@/components/$compName.jsx'",
                    "from `"@/components/$compName`"",
                    "from 'components/$compName'",
                    "import $compName from",
                    "import { $compName } from"
                )
                
                foreach ($file in $allFiles) {
                    $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
                    if (-not $content) { continue }
                    
                    # Chercher les imports directs
                    foreach ($importStr in $importStrings) {
                        if ($content -like "*$importStr*") {
                            $importUsage++
                            break
                        }
                    }
                    
                    # Chercher les imports conditionnels (if, ternary, etc.)
                    if ($content -match "if\s*\([^)]*\)\s*.*import.*$compName|ternary.*import.*$compName|\?\s*.*import.*$compName") {
                        $conditionalUsage++
                    }
                    
                    # Chercher les imports dynamiques
                    if ($content -match "React\.lazy.*$compName|lazy\(.*$compName|dynamic.*$compName|await import.*$compName|import\(.*$compName") {
                        $dynamicUsage++
                    }
                    
                    # Chercher les utilisations JSX
                    if ($content -like "*<$compName*" -or $content -like "*<$compName>*") {
                        $jsxUsage++
                    }
                }
                
                $totalUsage = $importUsage + $jsxUsage + $conditionalUsage + $dynamicUsage
                
                if ($totalUsage -le 1) {
                    # Potentiellement mort, mais générer contexte pour l'IA
                    $deadCode.Components += $compName
                    
                    $aiContext += @{
                        Category = "Code Mort"
                        Type = "Unused Component"
                        Component = $compName
                        File = $compFile.FullName
                        ImportUsage = $importUsage
                        JsxUsage = $jsxUsage
                        ConditionalUsage = $conditionalUsage
                        DynamicUsage = $dynamicUsage
                        Severity = "medium"
                        NeedsAICheck = $true
                        Question = "Le composant '$compName' est-il vraiment inutilisé ou est-il importé de manière conditionnelle/dynamique non détectée automatiquement ?"
                    }
                    
                    Write-Warn "Composant potentiellement mort: $compName (imports: $importUsage, JSX: $jsxUsage, conditionnel: $conditionalUsage, dynamique: $dynamicUsage)"
                } else {
                    Write-Info "  $compName utilisé (imports: $importUsage, JSX: $jsxUsage, conditionnel: $conditionalUsage, dynamique: $dynamicUsage)"
                }
            }
        }
        
        # Analyser hooks (AMÉLIORÉ)
        if (Test-Path "hooks") {
            Write-Info "Analyse hooks avec détection usage conditionnel..."
            $allHooks = Get-ChildItem -Path hooks -File -Include *.js -Exclude index.js -ErrorAction SilentlyContinue
            
            foreach ($hookFile in $allHooks) {
                $hookName = $hookFile.BaseName
                $usage = 0
                $conditionalUsage = 0
                
                foreach ($file in $searchFiles) {
                    $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
                    if (-not $content) { continue }
                    
                    # Chercher usage direct
                    if ($content -match "\b$hookName\s*\(") {
                        $usage++
                    }
                    
                    # Chercher usage conditionnel
                    if ($content -match "if\s*\([^)]*\)\s*.*$hookName|ternary.*$hookName") {
                        $conditionalUsage++
                    }
                }
                
                if ($usage -le 1 -and $conditionalUsage -eq 0) {
                    $deadCode.Hooks += $hookName
                    
                    $aiContext += @{
                        Category = "Code Mort"
                        Type = "Unused Hook"
                        Hook = $hookName
                        File = $hookFile.FullName
                        Usage = $usage
                        ConditionalUsage = $conditionalUsage
                        Severity = "medium"
                        NeedsAICheck = $true
                        Question = "Le hook '$hookName' est-il vraiment inutilisé ou est-il utilisé de manière conditionnelle non détectée ?"
                    }
                    
                    Write-Warn "Hook potentiellement mort: $hookName"
                }
            }
        }
        
        # Analyser libs (AMÉLIORÉ)
        if (Test-Path "lib") {
            Write-Info "Analyse libs avec détection usage conditionnel..."
            $allLibs = Get-ChildItem -Path lib -File -Include *.js -ErrorAction SilentlyContinue
            
            foreach ($libFile in $allLibs) {
                $libName = $libFile.BaseName
                $usage = 0
                $conditionalUsage = 0
                
                foreach ($file in $searchFiles) {
                    $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
                    if (-not $content) { continue }
                    
                    # Chercher usage direct
                    $libPattern = "from.*['`"]@/lib/$libName|from.*['`"]lib/$libName|import.*$libName"
                    if ($content -match $libPattern) {
                        $usage++
                    }
                    
                    # Chercher usage conditionnel
                    if ($content -match "if\s*\([^)]*\)\s*.*import.*$libName") {
                        $conditionalUsage++
                    }
                }
                
                if ($usage -le 1 -and $conditionalUsage -eq 0) {
                    $deadCode.Libs += $libName
                    
                    $aiContext += @{
                        Category = "Code Mort"
                        Type = "Unused Library"
                        Library = $libName
                        File = $libFile.FullName
                        Usage = $usage
                        ConditionalUsage = $conditionalUsage
                        Severity = "low"
                        NeedsAICheck = $true
                        Question = "La librairie '$libName' est-elle vraiment inutilisée ou est-elle importée de manière conditionnelle non détectée ?"
                    }
                    
                    Write-Warn "Lib potentiellement morte: $libName"
                }
            }
        }
        
        # Sauvegarder le contexte pour l'IA
        if (-not $Results.AIContext) {
            $Results.AIContext = @{}
        }
        $Results.AIContext.DeadCode = @{
            Components = $deadCode.Components.Count
            Hooks = $deadCode.Hooks.Count
            Libs = $deadCode.Libs.Count
            Questions = $aiContext
        }
        
        if ($deadCode.Components.Count -eq 0 -and $deadCode.Hooks.Count -eq 0 -and $deadCode.Libs.Count -eq 0) {
            Write-OK "Aucun code mort détecté"
            $Results.Scores["Code Mort"] = 10
        } else {
            Write-Warn "$($deadCode.Components.Count) composant(s), $($deadCode.Hooks.Count) hook(s), $($deadCode.Libs.Count) lib(s) potentiellement morts (nécessite vérification IA)"
            $Results.Scores["Code Mort"] = [Math]::Max(10 - ($deadCode.Components.Count + $deadCode.Hooks.Count + $deadCode.Libs.Count) * 0.5, 5)
        }
    } catch {
        Write-Err "Erreur analyse code mort: $($_.Exception.Message)"
        $Results.Scores["Code Mort"] = 7
    }
}

