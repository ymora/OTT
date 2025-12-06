# ===============================================================================
# VÉRIFICATION : ROUTES
# ===============================================================================

function Invoke-Check-Routes {
    param(
        [Parameter(Mandatory=$true)]
        [array]$Files,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Config,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Results,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$ProjectInfo
    )
    
    Write-Section "[5/13] Routes et Navigation"
    
    try {
        $missingPages = 0
        
        # Détecter automatiquement les pages si Next.js
        if ($ProjectInfo.Framework -match "Next.js") {
            if (Test-Path "app") {
                # App Router
                $pages = Get-ChildItem -Path app -Recurse -File -Include page.js,page.jsx -ErrorAction SilentlyContinue
                Write-OK "Pages détectées: $($pages.Count)"
            } elseif (Test-Path "pages") {
                # Pages Router
                $pages = Get-ChildItem -Path pages -Recurse -File -Include *.js,*.jsx -ErrorAction SilentlyContinue
                Write-OK "Pages détectées: $($pages.Count)"
            }
        }
        
        $Results.Scores["Routes"] = 10
    } catch {
        Write-Err "Erreur analyse routes: $($_.Exception.Message)"
        $Results.Scores["Routes"] = 5
    }
}

