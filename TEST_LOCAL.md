# 🧪 Test Local de l'Endpoint `/firmwares/upload-ino`

## Problème actuel
Le serveur Render retourne un **404** car la dernière version du code n'est pas déployée.

## Solution : Tester en Local

### 1. Démarrer l'API avec Docker
```powershell
docker-compose up -d
```

### 2. Vérifier que l'API fonctionne
```powershell
# Tester l'endpoint (devrait retourner 401 sans token, pas 404)
curl -X POST http://localhost:8080/api.php/firmwares/upload-ino
```

### 3. Tester avec un token valide
```powershell
# Se connecter
$loginResponse = Invoke-RestMethod -Uri "http://localhost:8080/api.php/auth/login" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email":"demo@example.com","password":"demo123"}'

$token = $loginResponse.token

# Tester l'upload
$filePath = "hardware/firmware/fw_ott_optimized/fw_ott_optimized.ino"
$formData = @{
    firmware_ino = Get-Item $filePath
}

Invoke-RestMethod -Uri "http://localhost:8080/api.php/firmwares/upload-ino" `
  -Method POST `
  -Headers @{Authorization = "Bearer $token"} `
  -Form $formData
```

### 4. Vérifier les logs
```powershell
docker-compose logs -f api
```

## Déploiement sur Render

Une fois que le test local fonctionne :

1. **Commit et push les changements** :
```powershell
git add api.php docker-compose.yml
git commit -m "Fix: Amélioration routage endpoint upload-ino avec debug"
git push origin main
```

2. **Vérifier le déploiement sur Render** :
   - Aller sur https://dashboard.render.com
   - Vérifier que le service API redémarre
   - Attendre la fin du déploiement

3. **Tester sur la production** :
   - Réessayer l'upload depuis le dashboard
   - Vérifier les logs Render pour voir les messages de debug

## Debug

Si le 404 persiste après déploiement, vérifier dans les logs Render :
- Le message `[API Router] Path not matched:` devrait montrer le chemin reçu
- Le message `[API Router] Checking path:` devrait apparaître pour chaque requête

