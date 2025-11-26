# Script d'analyse des documentations
# Vérifie les redondances, images manquantes, et organisation

$docsPath = "public/docs"
$htmlFiles = @(
    "DOCUMENTATION_PRESENTATION.html",
    "DOCUMENTATION_DEVELOPPEURS.html",
    "DOCUMENTATION_COMMERCIALE.html"
)

Write-Host "=== Analyse des Documentations ===" -ForegroundColor Cyan
Write-Host ""

# 1. Vérifier les images manquantes
Write-Host "1. Images manquantes:" -ForegroundColor Yellow
$allImages = @()
foreach ($file in $htmlFiles) {
    $filePath = Join-Path $docsPath $file
    if (Test-Path $filePath) {
        $content = Get-Content $filePath -Raw -Encoding UTF8
        $matches = [regex]::Matches($content, 'src=["'']([^"'']+screenshots/[^"'']+)["'']')
        foreach ($match in $matches) {
            $imgPath = $match.Groups[1].Value
            $fullPath = Join-Path $docsPath $imgPath
            if (-not (Test-Path $fullPath)) {
                Write-Host "  - $file : $imgPath (MANQUANTE)" -ForegroundColor Red
                $allImages += @{File=$file; Path=$imgPath; Missing=$true}
            } else {
                $allImages += @{File=$file; Path=$imgPath; Missing=$false}
            }
        }
    }
}

Write-Host "`nTotal images referencees: $($allImages.Count)" -ForegroundColor Cyan
Write-Host "Images manquantes: $(($allImages | Where-Object {$_.Missing}).Count)" -ForegroundColor $(if (($allImages | Where-Object {$_.Missing}).Count -gt 0) { "Red" } else { "Green" })

# 2. Vérifier les redondances dans les introductions
Write-Host "`n2. Redondances dans les introductions:" -ForegroundColor Yellow
$introTexts = @{}
foreach ($file in $htmlFiles) {
    $filePath = Join-Path $docsPath $file
    if (Test-Path $filePath) {
        $content = Get-Content $filePath -Raw -Encoding UTF8
        if ($content -match '<section id="intro"[^>]*>(.*?)</section>') {
            $intro = $matches[1]
            # Extraire le texte principal (premières lignes)
            $introClean = $intro -replace '<[^>]+>', '' -replace '\s+', ' ' | Select-Object -First 500
            $introTexts[$file] = $introClean
        }
    }
}

# Comparer les introductions
$similarity = @{}
$introKeys = $introTexts.Keys | Sort-Object
for ($i = 0; $i -lt $introKeys.Count; $i++) {
    for ($j = $i + 1; $j -lt $introKeys.Count; $j++) {
        $file1 = $introKeys[$i]
        $file2 = $introKeys[$j]
        $text1 = $introTexts[$file1]
        $text2 = $introTexts[$file2]
        
        # Calculer similarité (mots communs)
        $words1 = $text1 -split '\s+' | Where-Object { $_.Length -gt 3 }
        $words2 = $text2 -split '\s+' | Where-Object { $_.Length -gt 3 }
        $common = ($words1 | Where-Object { $words2 -contains $_ }).Count
        $total = ($words1.Count + $words2.Count) / 2
        $similarityPercent = if ($total -gt 0) { ($common / $total) * 100 } else { 0 }
        
        if ($similarityPercent -gt 50) {
            Write-Host "  - $file1 <-> $file2 : $([Math]::Round($similarityPercent, 1))% de similarite" -ForegroundColor Yellow
        }
    }
}

# 3. Vérifier les menus de navigation
Write-Host "`n3. Menus de navigation:" -ForegroundColor Yellow
foreach ($file in $htmlFiles) {
    $filePath = Join-Path $docsPath $file
    if (Test-Path $filePath) {
        $content = Get-Content $filePath -Raw -Encoding UTF8
        $hasNav = $content -match 'nav-menu|nav class'
        $hasSticky = $content -match 'position:\s*sticky'
        if ($hasNav -and $hasSticky) {
            Write-Host "  - $file : Menu OK (sticky)" -ForegroundColor Green
        } elseif ($hasNav) {
            Write-Host "  - $file : Menu present mais pas sticky" -ForegroundColor Yellow
        } else {
            Write-Host "  - $file : Pas de menu" -ForegroundColor Red
        }
    }
}

Write-Host "`n=== Analyse terminee ===" -ForegroundColor Cyan

