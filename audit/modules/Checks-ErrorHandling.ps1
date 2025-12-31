# ===============================================================================
# VÉRIFICATION : GESTION D'ERREURS
# ===============================================================================

function Invoke-Check-ErrorHandling {
    param(
        [Parameter(Mandatory=$true)]
        [array]$Files,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Config,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Results
    )
    
    Write-Section "[15/23] Gestion d'Erreurs"
    
    try {
        $issues = @()
        $warnings = @()
        $score = 10.0
        
        # Vérifier Error Boundaries React
        $jsxFiles = $Files | Where-Object { $_.Extension -match "\.(js|jsx|ts|tsx)$" }
        
        $errorBoundaryFiles = $jsxFiles | Select-String -Pattern "ErrorBoundary|componentDidCatch|getDerivedStateFromError" -ErrorAction SilentlyContinue | 
            Group-Object Path | ForEach-Object { $_.Name }
        
        if ($errorBoundaryFiles.Count -eq 0) {
            $warnings += "Aucun ErrorBoundary React détecté"
            Write-Warn "Aucun ErrorBoundary React détecté"
            $score -= 2.0
        } else {
            Write-OK "$($errorBoundaryFiles.Count) ErrorBoundary(s) détecté(s)"
        }
        
        # Vérifier try/catch dans les fonctions async (simplifié - détecte aussi les hooks)
        $asyncFunctions = $jsxFiles | Select-String -Pattern "async\s+(function|const|\()" -ErrorAction SilentlyContinue | 
            Measure-Object | Select-Object -ExpandProperty Count
        
        # Détecter try/catch direct dans async
        $tryCatchInAsync = $jsxFiles | Select-String -Pattern "async.*\{[\s\S]{0,500}try\s*\{[\s\S]{0,500}catch" -ErrorAction SilentlyContinue | 
            Measure-Object | Select-Object -ExpandProperty Count
        
        # Détecter les hooks avec gestion d'erreurs (useAsync, useAsyncState, useActionState, useApiCall, useApiData)
        # Ces hooks ont déjà try/catch intégré, donc les fonctions qui les utilisent sont protégées
        $filesWithProtectedHooks = $jsxFiles | Select-String -Pattern "(useAsync|useAsyncState|useActionState|useApiCall|useApiData|withErrorHandling)" -ErrorAction SilentlyContinue | 
            Group-Object Path | ForEach-Object { $_.Name } | Measure-Object | Select-Object -ExpandProperty Count
        
        if ($asyncFunctions -gt 0) {
            # Estimer le ratio : try/catch direct + fichiers avec hooks protégés
            # On considère qu'un fichier avec hooks protégés a au moins 50% de ses fonctions async protégées
            $estimatedProtected = $tryCatchInAsync + [Math]::Round($filesWithProtectedHooks * 0.5)
            $tryCatchRatio = [Math]::Round(($estimatedProtected / $asyncFunctions) * 100, 1)
            if ($tryCatchRatio -lt 50) {
                $warnings += "Seulement $tryCatchRatio% des fonctions async utilisent try/catch (direct ou via hooks)"
                Write-Warn "Seulement $tryCatchRatio% des fonctions async utilisent try/catch (recommandé >= 50%)"
                $score -= 1.0
            } else {
                Write-OK "$tryCatchRatio% des fonctions async utilisent try/catch (direct ou via hooks)"
            }
        }
        
        # Vérifier la gestion d'erreurs dans les appels API (PHP)
        $phpFiles = $Files | Where-Object { $_.Extension -eq ".php" }
        
        if ($phpFiles) {
            $apiCalls = $phpFiles | Select-String -Pattern "(fetch|curl_exec|file_get_contents|PDO::|mysqli_)" -ErrorAction SilentlyContinue | 
                Measure-Object | Select-Object -ExpandProperty Count
            
            $errorHandledApiCalls = $phpFiles | Select-String -Pattern "(try\s*\{[\s\S]{0,300}(fetch|curl_exec|file_get_contents|PDO::|mysqli_)|catch\s*\(|error_log)" -ErrorAction SilentlyContinue | 
                Measure-Object | Select-Object -ExpandProperty Count
            
            if ($apiCalls -gt 0) {
                $errorHandlingRatio = [Math]::Round(($errorHandledApiCalls / $apiCalls) * 100, 1)
                if ($errorHandlingRatio -lt 70) {
                    $warnings += "Seulement $errorHandlingRatio% des appels API utilisent try/catch ou error_log"
                    Write-Warn "Seulement $errorHandlingRatio% des appels API utilisent try/catch (recommandé >= 70%)"
                    $score -= 1.5
                } else {
                    Write-OK "$errorHandlingRatio% des appels API utilisent la gestion d'erreurs"
                }
            }
        }
        
        # Vérifier les console.error non gérés (exclure logger.js et usbPortSharing.js qui sont des wrappers)
        $consoleErrors = $jsxFiles | Select-String -Pattern "console\.error" -ErrorAction SilentlyContinue | 
            Where-Object { 
                $line = $_.Line
                $path = $_.Path
                # Exclure les fichiers qui sont des wrappers/loggers légitimes
                $path -notmatch "logger\.js$|usbPortSharing\.js$" -and
                # Exclure les lignes dans catch, ErrorBoundary, ou qui utilisent logger
                $line -notmatch "catch|ErrorBoundary|logger\.error|logger\["
            } | 
            Measure-Object | Select-Object -ExpandProperty Count
        
        if ($consoleErrors -gt 10) {
            $warnings += "$consoleErrors console.error détectés (devraient utiliser logger ou ErrorBoundary)"
            Write-Warn "$consoleErrors console.error détectés (recommandé: utiliser logger)"
            $score -= 0.5
        } elseif ($consoleErrors -gt 0) {
            Write-OK "$consoleErrors console.error (acceptable, principalement dans logger/usbPortSharing)"
        } else {
            Write-OK "Aucun console.error non géré détecté"
        }
        
        # Enregistrer les résultats
        $Results.Scores["Gestion d'Erreurs"] = [Math]::Max($score, 0)
        
        if ($issues.Count -gt 0) {
            foreach ($issue in $issues) {
                $Results.Issues += "Gestion d'Erreurs: $issue"
            }
        }
        
        if ($warnings.Count -gt 0) {
            foreach ($warning in $warnings) {
                $Results.Warnings += "Gestion d'Erreurs: $warning"
            }
        }
        
        Write-OK "Vérification gestion d'erreurs terminée"
        
    } catch {
        Write-Err "Erreur vérification gestion d'erreurs: $($_.Exception.Message)"
        $Results.Scores["Gestion d'Erreurs"] = 5
    }
}

