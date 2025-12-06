# ===============================================================================
# VÉRIFICATION : CODE MORT
# ===============================================================================

function Invoke-Check-CodeMort {
    param(
        [Parameter(Mandatory=$true)]
        [array]$Files,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Config,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Results
    )
    
    if (-not $Config.Checks.DeadCode.Enabled) {
        return
    }
    
    Write-Section "[2/13] Code Mort - Détection Composants/Hooks/Libs Non Utilisés"
    
    try {
        $deadCode = @{
            Components = @()
            Hooks = @()
            Libs = @()
        }
        
        $searchFiles = $Files | Where-Object { $_.Extension -match "\.jsx?$" }
        
        # Analyser composants
        if (Test-Path "components") {
            Write-Info "Analyse composants..."
            $allComponents = Get-ChildItem -Path components -Recurse -File -Include *.js,*.jsx -ErrorAction SilentlyContinue
            
            foreach ($compFile in $allComponents) {
                $compName = $compFile.BaseName
                
                # Recherche améliorée : prendre en compte les alias d'imports (@/)
                # Chercher l'import du composant (recherche simple sans échappement regex)
                $allFiles = $searchFiles + $compFile
                $importUsage = 0
                $jsxUsage = 0
                
                # Patterns d'imports à chercher (recherche littérale)
                $importStrings = @(
                    "from '@/components/$compName'",
                    "from '@/components/$compName.js'",
                    "from '@/components/$compName.jsx'",
                    "from `"@/components/$compName`"",
                    "from `"@/components/$compName.js`"",
                    "from 'components/$compName'",
                    "from 'components/$compName.js'",
                    "import $compName from",
                    "import { $compName } from"
                )
                
                foreach ($file in $allFiles) {
                    $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
                    if ($content) {
                        # Chercher les imports (recherche littérale, pas regex)
                        foreach ($importStr in $importStrings) {
                            if ($content -like "*$importStr*") {
                                $importUsage++
                                break
                            }
                        }
                        
                        # Chercher les utilisations JSX (pattern simple)
                        if ($content -like "*<$compName*" -or $content -like "*<$compName>*") {
                            $jsxUsage++
                        }
                    }
                }
                
                # Le composant est utilisé s'il y a au moins un import OU une utilisation JSX
                # (on compte au moins 2 car le fichier lui-même contient l'export)
                $totalUsage = $importUsage + $jsxUsage
                
                if ($totalUsage -le 1) {
                    # Moins de 1 = probablement juste l'export, considérer comme mort
                    $deadCode.Components += $compName
                    Write-Err "Composant mort: $compName (imports: $importUsage, JSX: $jsxUsage)"
                    $Results.Issues += @{
                        Type = "dead_code"
                        Severity = $Config.Checks.DeadCode.Severity
                        Description = "Composant non utilisé: $compName"
                        File = $compFile.FullName
                        Line = 1
                    }
                } else {
                    Write-Info "  $compName utilisé (imports: $importUsage, JSX: $jsxUsage)"
                }
            }
        }
        
        # Analyser hooks
        if (Test-Path "hooks") {
            Write-Info "Analyse hooks..."
            $allHooks = Get-ChildItem -Path hooks -File -Include *.js -Exclude index.js -ErrorAction SilentlyContinue
            
            foreach ($hookFile in $allHooks) {
                $hookName = $hookFile.BaseName
                $usage = @($searchFiles | Select-String -Pattern $hookName).Count
                
                if ($usage -le 1) {
                    $deadCode.Hooks += $hookName
                    Write-Err "Hook mort: $hookName"
                    $Results.Issues += @{
                        Type = "dead_code"
                        Severity = $Config.Checks.DeadCode.Severity
                        Description = "Hook non utilisé: $hookName"
                        File = $hookFile.FullName
                        Line = 1
                    }
                }
            }
        }
        
        # Analyser libs
        if (Test-Path "lib") {
            Write-Info "Analyse libs..."
            $allLibs = Get-ChildItem -Path lib -File -Include *.js -ErrorAction SilentlyContinue
            
            foreach ($libFile in $allLibs) {
                $libName = $libFile.BaseName
                $usage = @($searchFiles | Where-Object { $_.FullName -notlike "*\lib\*" } | Select-String -Pattern $libName).Count
                
                if ($usage -eq 0) {
                    $deadCode.Libs += $libName
                    Write-Err "Lib morte: $libName"
                    $Results.Issues += @{
                        Type = "dead_code"
                        Severity = $Config.Checks.DeadCode.Severity
                        Description = "Lib non utilisée: $libName"
                        File = $libFile.FullName
                        Line = 1
                    }
                }
            }
        }
        
        $totalDead = $deadCode.Components.Count + $deadCode.Hooks.Count + $deadCode.Libs.Count
        
        if ($totalDead -eq 0) {
            Write-OK "Aucun code mort détecté"
            $Results.Scores["CodeMort"] = 10
        } else {
            Write-Warn "$totalDead fichiers non utilisés détectés"
            $Results.Scores["CodeMort"] = [Math]::Max(10 - $totalDead, 0)
        }
    } catch {
        Write-Err "Erreur analyse code mort: $($_.Exception.Message)"
        $Results.Scores["CodeMort"] = 5
    }
}

