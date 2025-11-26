# Script pour restaurer les balises img avec fallback élégant

$docsPath = "public/docs"
$htmlFiles = @(
    "DOCUMENTATION_PRESENTATION.html",
    "DOCUMENTATION_DEVELOPPEURS.html",
    "DOCUMENTATION_COMMERCIALE.html"
)

foreach ($file in $htmlFiles) {
    $filePath = Join-Path $docsPath $file
    if (Test-Path $filePath) {
        Write-Host "Traitement de $file..." -ForegroundColor Cyan
        $content = Get-Content $filePath -Raw -Encoding UTF8
        
        # Remplacer les placeholders par des balises img avec fallback
        # Pattern: div avec "Image non disponible" suivi de commentaire img
        $pattern = '(?s)<div style="[^"]*background: linear-gradient[^"]*"[^>]*>.*?Image non disponible.*?</div>\s*<!-- <img src="screenshots/([^"]+)" alt="([^"]+)"[^>]*/>'
        
        $content = $content -replace $pattern, {
            param($match)
            $imgName = $matches[1]
            $altText = $matches[2]
            $imgId = [System.Guid]::NewGuid().ToString().Substring(0,8)
            @"
<img id="img_$imgId" src="screenshots/$imgName" alt="$altText" 
     style="max-width: 100%; border: 1px solid #ddd; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" 
     onerror="this.style.display='none'; document.getElementById('placeholder_$imgId').style.display='flex';" />
<div id="placeholder_$imgId" style="background: linear-gradient(135deg, #f0f0f0 0%, #e0e0e0 100%); min-height: 300px; display: none; align-items: center; justify-content: center; border: 2px dashed #ccc; border-radius: 8px; color: #999; font-style: italic; flex-direction: column;">
    📸 $altText<br>
    <small style="display: block; margin-top: 0.5rem; font-size: 0.9rem;">Capture d'écran non disponible</small>
</div>
"@
        }
        
        # Nettoyer les divs placeholder orphelins
        $content = $content -replace '(?s)<div style="[^"]*background: linear-gradient[^"]*"[^>]*>.*?Image non disponible.*?</div>\s*(?!<!--)', ''
        
        Set-Content -Path $filePath -Value $content -Encoding UTF8 -NoNewline
        Write-Host "  OK: $file traite" -ForegroundColor Green
    }
}

Write-Host "`nRestauration terminee" -ForegroundColor Green

