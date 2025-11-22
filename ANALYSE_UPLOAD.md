# Analyse Complète - Upload Firmware

## 🎯 Objectif de l'Upload

L'upload de firmware sert à :
1. **Uploader un fichier .ino** (code source Arduino)
2. **Extraire la version** depuis le fichier (FIRMWARE_VERSION_STR)
3. **Sauvegarder le fichier** dans `hardware/firmware/vX.X/`
4. **Enregistrer en base** avec status='pending_compilation'
5. **Compiler automatiquement** le firmware en .bin

## 📊 Comparaison avec les autres endpoints qui fonctionnent

### Users/Patients (✅ Fonctionnent)
- **Méthode** : POST avec JSON
- **Content-Type** : `application/json`
- **Données** : `JSON.stringify({...})`
- **Réception** : `json_decode(file_get_contents('php://input'), true)`
- **Exemple** : `fetchWithAuth('/api.php/users', { method: 'POST', body: JSON.stringify(data) })`

### Upload Firmware (❌ Bloque)
- **Méthode** : POST avec FormData
- **Content-Type** : `multipart/form-data` (automatique avec FormData)
- **Données** : `FormData.append('firmware_ino', file)`
- **Réception** : `$_FILES['firmware_ino']`
- **Exemple** : `xhr.send(formData)` avec XMLHttpRequest

## 🔍 Différences Clés

1. **Content-Type** : JSON vs multipart/form-data
2. **Transport** : fetch() vs XMLHttpRequest
3. **Réception** : php://input vs $_FILES

## 🧪 Tests à Faire

1. ✅ Vérifier que la route est bien matchée
2. ✅ Vérifier que $_FILES est rempli
3. ✅ Vérifier que le fichier temporaire existe
4. ✅ Vérifier que la version est extraite
5. ✅ Vérifier que le dossier est créé
6. ✅ Vérifier que le fichier est sauvegardé
7. ✅ Vérifier que l'INSERT en base fonctionne
8. ✅ Vérifier que la réponse JSON est envoyée

## 🐛 Problèmes Potentiels

1. **Route ne matche pas** : Le regex `#^/firmwares/upload-ino/?$#` pourrait ne pas matcher
2. **$_FILES vide** : Le fichier n'arrive pas au serveur
3. **Authentification bloque** : requireAuth() échoue silencieusement
4. **Headers déjà envoyés** : Conflit de Content-Type
5. **Timeout** : La requête prend trop de temps
6. **CORS** : Blocage côté navigateur

## 📝 Plan de Test

1. Créer un endpoint de test simple (test_upload_simple.php)
2. Tester avec curl/Postman pour isoler le problème
3. Vérifier les logs serveur
4. Vérifier la console navigateur
5. Comparer avec un endpoint qui fonctionne

