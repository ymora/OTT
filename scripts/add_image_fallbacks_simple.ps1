# Script simple pour ajouter le fallback aux images

$docs = @('DOCUMENTATION_PRESENTATION.html', 'DOCUMENTATION_DEVELOPPEURS.html', 'DOCUMENTATION_COMMERCIALE.html')

foreach ($doc in $docs) {
    $path = "public/docs/$doc"
    $content = Get-Content $path -Raw -Encoding UTF8
    
    # Remplacer toutes les images sans onerror par des images avec onerror + div
    $pattern = '<img src="screenshots/([^"]+)" alt="([^"]+)" style="([^"]+)" />'
    
    $content = $content -replace $pattern, {
        param($match)
        $imgName = $matches[1]
        $altText = $matches[2]
        $style = $matches[3]
        
        # Vérifier si onerror existe déjà
        if ($match -notmatch 'onerror') {
            "<img src=`"screenshots/$imgName`" alt=`"$altText`" style=`"$style`" onerror=`"this.onerror=null; this.style.display='none'; this.nextElementSibling.style.display='flex';`" />
        <div style=`"display: none; background: linear-gradient(135deg, #f0f0f0 0%, #e0e0e0 100%); min-height: 300px; align-items: center; justify-content: center; border: 2px dashed #ccc; border-radius: 8px; color: #999; font-style: italic; flex-direction: column; margin: 1rem 0;`">
            📸 $altText<br>
            <small style=`"display: block; margin-top: 0.5rem; font-size: 0.9rem;`">Capture d'écran non disponible</small>
        </div>"
        } else {
            $match
        }
    }
    
    Set-Content $path $content -Encoding UTF8 -NoNewline
    Write-Host "✓ $doc traité" -ForegroundColor Green
}

Write-Host "`nTerminé !" -ForegroundColor Cyan

