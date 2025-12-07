# Script de test pour vérifier que l'API retourne bien deleted_at

Write-Host "🧪 Test de l'API Users - Vérification deleted_at" -ForegroundColor Cyan
Write-Host ""

# URL de l'API (ajustez si nécessaire)
$API_URL = "http://localhost:3000/api.php/users?include_deleted=true"

try {
    Write-Host "📡 Requête: $API_URL" -ForegroundColor Yellow
    
    $response = Invoke-WebRequest -Uri $API_URL -Method GET -ErrorAction Stop
    $json = $response.Content | ConvertFrom-Json
    
    if ($json.success) {
        Write-Host "✅ API répond correctement" -ForegroundColor Green
        Write-Host "📊 Nombre d'utilisateurs: $($json.users.Count)" -ForegroundColor Cyan
        Write-Host ""
        
        $usersWithDeletedAt = 0
        $usersWithoutDeletedAt = 0
        $archivedUsers = 0
        
        foreach ($user in $json.users) {
            if ($user.PSObject.Properties.Name -contains 'deleted_at') {
                $usersWithDeletedAt++
                
                if ($user.deleted_at -and $user.deleted_at -ne '' -and $null -ne $user.deleted_at) {
                    $archivedUsers++
                    Write-Host "🗄️  Utilisateur archivé: $($user.first_name) $($user.last_name) - deleted_at: $($user.deleted_at)" -ForegroundColor Gray
                }
            } else {
                $usersWithoutDeletedAt++
                Write-Host "❌ PROBLÈME: $($user.first_name) $($user.last_name) n'a PAS le champ deleted_at !" -ForegroundColor Red
            }
        }
        
        Write-Host ""
        Write-Host "📊 Résumé:" -ForegroundColor Cyan
        Write-Host "   ✅ Utilisateurs avec deleted_at: $usersWithDeletedAt" -ForegroundColor Green
        if ($usersWithoutDeletedAt -gt 0) {
            Write-Host "   ❌ Utilisateurs SANS deleted_at: $usersWithoutDeletedAt" -ForegroundColor Red
        }
        Write-Host "   🗄️  Utilisateurs archivés: $archivedUsers" -ForegroundColor Yellow
        
        if ($usersWithoutDeletedAt -eq 0) {
            Write-Host ""
            Write-Host "✅ TOUT EST OK ! L'API retourne bien deleted_at pour tous les utilisateurs." -ForegroundColor Green
        } else {
            Write-Host ""
            Write-Host "❌ PROBLÈME: Certains utilisateurs n'ont pas deleted_at dans la réponse API." -ForegroundColor Red
            Write-Host "   → Le serveur PHP n'a peut-être pas rechargé les changements" -ForegroundColor Yellow
            Write-Host "   → Redémarrez Apache/Nginx ou le serveur PHP" -ForegroundColor Yellow
        }
    } else {
        Write-Host "❌ L'API a retourné une erreur" -ForegroundColor Red
        Write-Host $json | ConvertTo-Json
    }
} catch {
    Write-Host "❌ Erreur lors de la requête:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Vérifiez que:" -ForegroundColor Yellow
    Write-Host "   1. Le serveur Next.js est lancé (port 3000)" -ForegroundColor White
    Write-Host "   2. Le backend PHP est accessible" -ForegroundColor White
    Write-Host "   3. L'URL de l'API est correcte" -ForegroundColor White
}

