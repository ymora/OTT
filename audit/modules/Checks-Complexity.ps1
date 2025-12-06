# ===============================================================================
# VÉRIFICATION : COMPLEXITÉ
# ===============================================================================

function Invoke-Check-Complexity {
    param(
        [Parameter(Mandatory=$true)]
        [array]$Files,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Config,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Results
    )
    
    if (-not $Config.Checks.Complexity.Enabled) {
        return
    }
    
    Write-Section "[4/13] Complexité - Fichiers/Fonctions Volumineux"
    
    try {
        $maxFileLines = $Config.Checks.Complexity.MaxFileLines
        $maxFunctionLines = $Config.Checks.Complexity.MaxFunctionLines
        $largeFiles = @()
        
        foreach ($file in $Files) {
            try {
                $lines = @(Get-Content $file.FullName -ErrorAction SilentlyContinue).Count
                if ($lines -gt $maxFileLines) {
                    $relativePath = $file.FullName.Replace((Get-Location).Path + '\', '').Replace((Get-Location).Path + '/', '')
                    $largeFiles += @{Path=$relativePath; Lines=$lines; File=$file}
                    Write-Warn "$relativePath : $lines lignes (> $maxFileLines)"
                    
                    $Results.Issues += @{
                        Type = "complexity"
                        Severity = "medium"
                        Description = "Fichier volumineux: $lines lignes (max recommandé: $maxFileLines)"
                        File = $file.FullName
                        Line = 0
                        Metrics = @{Lines = $lines; Complexity = 0}
                    }
                }
            } catch {}
        }
        
        $complexityScore = if($largeFiles.Count -lt 10) { 10 } 
                          elseif($largeFiles.Count -lt 20) { 9 } 
                          elseif($largeFiles.Count -lt 30) { 8 } 
                          else { 7 }
        
        if ($largeFiles.Count -eq 0) {
            Write-OK "Complexité code parfaite"
        } elseif ($largeFiles.Count -lt 20) {
            Write-OK "$($largeFiles.Count) fichiers volumineux (acceptable)"
        } else {
            Write-Warn "$($largeFiles.Count) fichiers volumineux (> $maxFileLines lignes)"
        }
        
        $Results.Scores["Complexity"] = $complexityScore
    } catch {
        Write-Err "Erreur analyse complexité: $($_.Exception.Message)"
        $Results.Scores["Complexity"] = 7
    }
}

