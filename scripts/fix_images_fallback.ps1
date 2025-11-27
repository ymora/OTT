# Script pour ajouter un fallback élégant aux images manquantes

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
        
        # Pattern pour trouver les images avec screenshots
        # Remplacer <img src="screenshots/..." /> par <img ... onerror="..."/> + <div placeholder>
        $pattern = '<img src="screenshots/([^"]+)" alt="([^"]+)" style="([^"]+)" />'
        
        $content = $content -replace $pattern, {
            param($match)
            $imgName = $matches[1]
            $altText = $matches[2]
            $style = $matches[3]
            
            # Extraire un nom court pour l'affichage
            $displayName = $altText
            
            @"
<img src="screenshots/$imgName" alt="$altText" style="$style" onerror="this.onerror=null; this.style.display='none'; this.nextElementSibling.style.display='flex';" />
<div style="display: none; background: linear-gradient(135deg, #f0f0f0 0%, #e0e0e0 100%); min-height: 300px; align-items: center; justify-content: center; border: 2px dashed #ccc; border-radius: 8px; color: #999; font-style: italic; flex-direction: column; margin: 1rem 0;">
    📸 $displayName<br>
    <small style="display: block; margin-top: 0.5rem; font-size: 0.9rem;">Capture d'écran non disponible</small>
</div>
"@
        }
        
        Set-Content -Path $filePath -Value $content -Encoding UTF8 -NoNewline
        Write-Host "  OK: $file traité" -ForegroundColor Green
    }
}

Write-Host "`nTraitement terminé" -ForegroundColor Green

