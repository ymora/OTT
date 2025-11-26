# Script pour corriger les problèmes de documentation
# - Corriger les chemins d'images manquantes
# - Vérifier les redondances
# - S'assurer que les accès rapides sont visibles

Write-Host "Analyse des documents de documentation..." -ForegroundColor Cyan

$docsPath = "public/docs"
$htmlFiles = @(
    "DOCUMENTATION_PRESENTATION.html",
    "DOCUMENTATION_DEVELOPPEURS.html",
    "DOCUMENTATION_COMMERCIALE.html"
)

# Créer le dossier screenshots s'il n'existe pas
$screenshotsPath = Join-Path $docsPath "screenshots"
if (-not (Test-Path $screenshotsPath)) {
    New-Item -ItemType Directory -Path $screenshotsPath -Force | Out-Null
    Write-Host "Dossier screenshots cree" -ForegroundColor Green
}

# Liste des images référencées
$referencedImages = @()

foreach ($file in $htmlFiles) {
    $filePath = Join-Path $docsPath $file
    if (Test-Path $filePath) {
        $content = Get-Content $filePath -Raw -Encoding UTF8
        
        # Extraire toutes les références d'images
        $pattern = 'src=["'']([^"'']+)["'']'
        $imageMatches = [regex]::Matches($content, $pattern)
        foreach ($match in $imageMatches) {
            $imgPath = $match.Groups[1].Value
            if ($imgPath -match 'screenshots/') {
                $referencedImages += $imgPath
            }
        }
    }
}

$uniqueImages = $referencedImages | Select-Object -Unique
Write-Host "Images referencees: $($uniqueImages.Count)" -ForegroundColor Yellow

# Créer des images placeholder pour celles qui manquent
foreach ($imgRef in $uniqueImages) {
    $imgName = $imgRef -replace 'screenshots/', ''
    $imgPath = Join-Path $screenshotsPath $imgName
    
    if (-not (Test-Path $imgPath)) {
        Write-Host "Image manquante: $imgName" -ForegroundColor Red
        # On ne peut pas créer de PNG facilement en PowerShell, on va juste noter
    }
}

# Vérifier les redondances dans l'introduction
Write-Host "`nVerification des redondances..." -ForegroundColor Cyan

$introTexts = @{}
foreach ($file in $htmlFiles) {
    $filePath = Join-Path $docsPath $file
    if (Test-Path $filePath) {
        $content = Get-Content $filePath -Raw -Encoding UTF8
        
        # Extraire la section introduction
        if ($content -match '<section id="intro"[^>]*>(.*?)</section>') {
            $intro = $matches[1]
            $introTexts[$file] = $intro
        }
    }
}

# Comparer les introductions
$introKeys = $introTexts.Keys | Sort-Object
for ($i = 0; $i -lt $introKeys.Count; $i++) {
    for ($j = $i + 1; $j -lt $introKeys.Count; $j++) {
        $file1 = $introKeys[$i]
        $file2 = $introKeys[$j]
        $text1 = $introTexts[$file1]
        $text2 = $introTexts[$file2]
        
        # Comparer les premières lignes (description principale)
        $lines1 = ($text1 -split "`n")[0..5] -join "`n"
        $lines2 = ($text2 -split "`n")[0..5] -join "`n"
        
        if ($lines1 -eq $lines2) {
            Write-Host "Redondance detectee entre $file1 et $file2" -ForegroundColor Yellow
        }
    }
}

Write-Host "`nAnalyse terminee" -ForegroundColor Green

