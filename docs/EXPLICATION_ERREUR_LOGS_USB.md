# 🔍 Pourquoi l'erreur SQL n'apparaissait pas dans les logs USB ?

## 📊 Flux d'exécution

### 1. Le firmware envoie une mesure
```
Firmware → HTTP POST → API Server
```

### 2. Le serveur traite la requête
```php
// Ligne 144 : Mise à jour de last_seen (AVANT l'insertion de la mesure)
UPDATE devices SET last_seen = :timestamp, last_battery = :battery ...

// Ligne 195-207 : Insertion de la mesure (dans un try-catch interne)
try {
    INSERT INTO measurements ...
} catch(PDOException $measurementError) {
    // Ligne 210 : Log dans les logs PHP du serveur (pas visibles par le firmware)
    error_log("[Measurement] ❌ ERREUR insertion mesure...");
    throw $measurementError; // Re-throw pour faire échouer la transaction
}
```

### 3. Le serveur retourne une réponse HTTP
```php
// Ligne 317-326 : Catch final
catch(PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database error']);
}
```

## ❌ Problème identifié

### Pourquoi l'erreur n'était pas visible dans les logs USB ?

1. **Les logs USB sont des logs du firmware** (côté dispositif)
2. **Les erreurs SQL sont loggées via `error_log()`** (côté serveur PHP)
3. **Ces deux systèmes ne sont pas connectés** :
   - `error_log()` → logs PHP du serveur (fichier de log du serveur web)
   - Logs USB → Serial.print() du firmware (visible dans le dashboard USB)

### Le firmware ne voyait que la réponse HTTP

Le firmware reçoit seulement :
```json
{
  "success": false,
  "error": "Database error"  // Message générique, pas l'erreur SQL réelle
}
```

**Problème** : Le firmware ne log peut-être pas les erreurs HTTP, ou les log de manière limitée.

## 🔧 Solution appliquée

### 1. Transaction atomique
```php
// AVANT : last_seen mis à jour même si insertion échoue
UPDATE devices SET last_seen = ...;  // ✅ Exécuté
INSERT INTO measurements ...;         // ❌ Échoue → mais last_seen déjà mis à jour

// APRÈS : Transaction atomique
BEGIN TRANSACTION;
  UPDATE devices SET last_seen = ...;
  INSERT INTO measurements ...;       // ❌ Échoue → ROLLBACK complet
ROLLBACK;  // last_seen n'est PAS mis à jour
```

### 2. Logs améliorés
```php
error_log("[Measurement] ❌ ERREUR insertion mesure pour dispositif $device_id (ICCID: $iccid): " . $measurementError->getMessage());
error_log("[Measurement] Code erreur: " . $measurementError->getCode());
error_log("[Measurement] Données: flowrate=$flowrateValue, battery=$battery, rssi=$rssi");
error_log("[Measurement] Stack trace: " . $measurementError->getTraceAsString());
```

### 3. Message d'erreur dans la réponse HTTP (si DEBUG activé)
```php
$errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
echo json_encode(['success' => false, 'error' => $errorMsg]);
```

## 📝 Où trouver les erreurs maintenant ?

### 1. Logs du serveur PHP
- Fichier de log du serveur web (Apache/Nginx)
- Logs Render.com (si déployé sur Render)
- `error_log()` → logs système du serveur

### 2. Réponse HTTP (si DEBUG activé)
```json
{
  "success": false,
  "error": "SQLSTATE[42703]: Undefined column: 7 ERROR: column \"min_flowrate\" does not exist"
}
```

### 3. Logs USB (si le firmware log les erreurs HTTP)
- Le firmware devrait log la réponse HTTP si `success: false`
- Visible dans le dashboard USB si le dispositif est connecté

## 🎯 Amélioration suggérée

### Option 1 : Le firmware log les erreurs HTTP
Vérifier que le firmware log les réponses HTTP avec `success: false` :
```cpp
if (response["success"] == false) {
    Serial.printf("[API] ❌ Erreur serveur: %s\n", response["error"].as<String>().c_str());
}
```

### Option 2 : Envoyer l'erreur dans les logs du dispositif
Créer un endpoint pour que le serveur envoie des logs au dispositif :
```php
// Après avoir catché l'erreur
if ($device_id) {
    // Envoyer un log au dispositif via l'endpoint /api.php/logs
    sendLogToDevice($device_id, 'ERROR', 'measurement_failed', $errorMsg);
}
```

### Option 3 : Améliorer les logs du serveur
- Centraliser les logs dans une table `server_logs`
- Créer une page de diagnostic pour voir les erreurs récentes
- Envoyer des alertes email/SMS en cas d'erreurs critiques

## ✅ Résultat

**Avant** :
- ❌ Erreur SQL silencieuse dans les logs PHP du serveur
- ❌ `last_seen` mis à jour mais pas de mesure
- ❌ Le firmware ne voyait pas l'erreur

**Après** :
- ✅ Transaction atomique : soit tout est enregistré, soit rien
- ✅ Logs détaillés dans les logs PHP du serveur
- ✅ Message d'erreur dans la réponse HTTP (si DEBUG activé)
- ✅ Plus d'incohérence possible

