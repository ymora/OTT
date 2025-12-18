# ===============================================================================
# VÉRIFICATION : DOCUMENTATION
# ===============================================================================

function Invoke-Check-Documentation {
    param(
        [Parameter(Mandatory=$true)]
        [array]$Files,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Config,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Results
    )
    
    if (-not $Config.Checks.Documentation.Enabled) {
        return
    }
    
    Write-Section "[18/21] Documentation"
    
    try {
        $mdFiles = $Files | Where-Object { $_.Extension -eq ".md" }
        $htmlDocs = Get-ChildItem -Recurse -File -Include *.html -ErrorAction SilentlyContinue | Where-Object {
            $_.FullName -match 'docs|documentation'
        }
        
        $docCount = $mdFiles.Count + $htmlDocs.Count
        $docScore = if($docCount -ge 5) { 10 } elseif($docCount -ge 3) { 8 } elseif($docCount -ge 1) { 6 } else { 4 }
        
        Write-OK "Documentation: $docCount fichier(s)"
        $Results.Scores["Documentation"] = $docScore
    } catch {
        $Results.Scores["Documentation"] = 5
    }
}

