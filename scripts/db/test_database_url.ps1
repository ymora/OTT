# Script de test pour vérifier le format de DATABASE_URL
# Usage: .\scripts\db\test_database_url.ps1 -DatabaseUrl "postgresql://user:pass@host:port/db"

param(
    [Parameter(Mandatory=$true)]
    [string]$DatabaseUrl
)

Write-Host "🔍 Test du format DATABASE_URL" -ForegroundColor Cyan
Write-Host ""

# Afficher l'URL masquée (sans mot de passe)
$urlMasked = $DatabaseUrl -replace '://([^:]+):([^@]+)@', '://$1:****@'
Write-Host "URL (masquée): $urlMasked" -ForegroundColor Gray
Write-Host ""

# Vérifier le format
if ($DatabaseUrl -notmatch '^postgresql?://') {
    Write-Host "❌ Format invalide: doit commencer par 'postgresql://' ou 'postgres://'" -ForegroundColor Red
    exit 1
}

# Parser l'URL
try {
    $uri = [System.Uri]$DatabaseUrl
    Write-Host "✅ Format URI valide" -ForegroundColor Green
    Write-Host "  Scheme: $($uri.Scheme)" -ForegroundColor Gray
    Write-Host "  Host: $($uri.Host)" -ForegroundColor Gray
    Write-Host "  Port: $($uri.Port)" -ForegroundColor Gray
    Write-Host "  Path: $($uri.AbsolutePath)" -ForegroundColor Gray
    Write-Host "  User: $($uri.UserInfo.Split(':')[0])" -ForegroundColor Gray
    Write-Host ""
    
    # Extraire les composants
    $userInfo = $uri.UserInfo
    if ($userInfo -match '^([^:]+):(.+)$') {
        $username = $Matches[1]
        $password = $Matches[2]
        Write-Host "✅ Username extrait: $username" -ForegroundColor Green
        Write-Host "✅ Password extrait: **** (longueur: $($password.Length))" -ForegroundColor Green
        
        # Vérifier les caractères spéciaux dans le mot de passe
        if ($password -match '[^a-zA-Z0-9]') {
            Write-Host "⚠️  Le mot de passe contient des caractères spéciaux" -ForegroundColor Yellow
            Write-Host "   Assurez-vous qu'ils sont correctement encodés en URL" -ForegroundColor Yellow
        }
    } else {
        Write-Host "❌ Impossible d'extraire username:password de UserInfo" -ForegroundColor Red
    }
    
    # Vérifier que tous les composants sont présents
    if ([string]::IsNullOrEmpty($uri.Host)) {
        Write-Host "❌ Host manquant" -ForegroundColor Red
        exit 1
    }
    if ([string]::IsNullOrEmpty($uri.AbsolutePath) -or $uri.AbsolutePath -eq '/') {
        Write-Host "❌ Nom de base de données manquant (path)" -ForegroundColor Red
        exit 1
    }
    
    $dbName = $uri.AbsolutePath.TrimStart('/')
    Write-Host ""
    Write-Host "✅ Tous les composants sont présents:" -ForegroundColor Green
    Write-Host "   Host: $($uri.Host)" -ForegroundColor Gray
    Write-Host "   Port: $($uri.Port)" -ForegroundColor Gray
    Write-Host "   Database: $dbName" -ForegroundColor Gray
    Write-Host "   Username: $username" -ForegroundColor Gray
    Write-Host ""
    
} catch {
    Write-Host "❌ Erreur lors du parsing: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Format DATABASE_URL valide!" -ForegroundColor Green
Write-Host ""
Write-Host "💡 Pour utiliser cette URL sur Render:" -ForegroundColor Cyan
Write-Host "   1. Allez sur Render → Service API → Environment" -ForegroundColor Gray
Write-Host "   2. Ajoutez/modifiez la variable DATABASE_URL" -ForegroundColor Gray
Write-Host "   3. Collez l'URL complète (avec mot de passe)" -ForegroundColor Gray
Write-Host "   4. Sauvegardez et redéployez" -ForegroundColor Gray

