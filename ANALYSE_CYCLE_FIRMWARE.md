# Analyse complète du cycle firmware et des coûts réseau

## 🔄 Cycle normal du firmware (hors mode USB)

### 1. Boot et initialisation
```
setup() {
  - initSerial()          // Port série USB pour logs
  - initBoard()           // Initialise les pins GPIO
  - initModem()           // Initialise le port série du modem (PAS de connexion réseau)
  - loadConfig()          // Charge la config depuis NVS
  - configureWatchdog()
  
  - detectUsbStreamingMode()  // Si "usb" reçu → mode USB (PAS de connexion réseau)
  
  // Si PAS en mode USB, continue le cycle normal :
  - captureSensorSnapshot()   // Mesure débit + batterie
  - startModem()              // ⚠️ ICI : démarre modem + connexion GPRS
  - getSignalQuality()        // Lit RSSI
  - getDeviceLocation()       // GPS ou réseau cellulaire
  - sendMeasurement()         // ⚠️ ICI : POST HTTP vers API (consomme données)
  - fetchCommands()           // Récupère les commandes en attente
  - stopModem()              // Déconnecte GPRS
  - goToSleep(minutes)       // Deep sleep
}
```

### 2. Envoi des mesures (ligne 261-265)
```cpp
if (!sendMeasurement(m, hasLocation ? &latitude : nullptr, hasLocation ? &longitude : nullptr)) {
  Serial.println(F("[API] Echec envoi mesure"));
} else {
  Serial.println(F("[API] Mesure envoyée avec succès"));
}
```

### 3. Fonction sendMeasurement() (ligne 921-953)
- Crée un JSON avec les données
- Appelle `httpPost(PATH_MEASURE, body)` → **POST HTTPS vers API**
- **Consomme des données cellulaires** (GPRS/4G)

### 4. Intervalle de sommeil
- Par défaut : 5 minutes (`DEFAULT_SLEEP_MINUTES`)
- Configurable via commande `SET_SLEEP_SECONDS`
- Le dispositif se réveille toutes les X minutes pour envoyer une mesure

---

## 📡 Mode USB Streaming

### Différences clés
1. **Pas de `startModem()`** → Pas de connexion GPRS
2. **Pas de `sendMeasurement()`** → Pas de POST HTTP
3. **Pas de `goToSleep()`** → Reste éveillé en continu
4. **Envoi via Serial USB uniquement** → Pas de données cellulaires

### Code (ligne 222-227)
```cpp
if (detectUsbStreamingMode()) {
  usbStreamingLoop();  // Boucle infinie, envoie via Serial USB
  ESP.restart();       // Redémarre après sortie
}
```

---

## 💰 Coûts avec Free Pro

### ✅ Mode USB Streaming
- **Aucun coût** : Pas de connexion GPRS, pas de données envoyées
- Le modem est initialisé (`initModem()`) mais **PAS démarré** (`startModem()`)
- Seulement des commandes AT de base pour lire l'ICCID

### ⚠️ Mode normal (hors USB)
- **Consomme des données** à chaque cycle :
  - Connexion GPRS/4G
  - POST HTTPS vers API (~500-1000 bytes par mesure)
  - GET pour récupérer les commandes
  - Position GPS/réseau cellulaire (optionnel)

### Calcul approximatif
- **1 mesure toutes les 5 minutes** = 12 mesures/heure = 288 mesures/jour
- **~1 KB par mesure** = ~288 KB/jour = ~8.6 MB/mois
- **Avec Free Pro** : Forfait généralement inclus, mais vérifier votre forfait

---

## 📊 Réception et stockage côté API

### Endpoint : `POST /api.php/devices/measurements`
1. Reçoit le JSON du firmware
2. Trouve ou crée le dispositif (par ICCID)
3. Met à jour `devices.last_seen` et `devices.last_battery`
4. Insère dans `measurements` (table d'historique)
5. Met à jour min/max automatiquement (trigger SQL)

### Code API (ligne 405-416)
```php
$measurementStmt = $pdo->prepare("
    INSERT INTO measurements (device_id, timestamp, flowrate, battery, signal_strength, device_status)
    VALUES (:device_id, :timestamp, :flowrate, :battery, :rssi, :status)
");
```

---

## 🖥️ Affichage dans l'interface

### 1. Page Dashboard (`/dashboard/page.js`)
- Rafraîchit toutes les **30 secondes** (ligne 24-30)
- Affiche `last_seen` et `last_battery` depuis la table `devices`
- **Problème potentiel** : Si le dispositif n'a jamais envoyé de mesure, `last_seen` est NULL

### 2. Page Devices (`/dashboard/devices/page.js`)
- Utilise `useApiData` qui charge les données au montage
- Affiche la liste des dispositifs avec `last_seen` et `last_battery`
- **Problème potentiel** : Pas de rafraîchissement automatique visible

### 3. Données affichées
- `last_seen` : Dernière fois que le dispositif a envoyé une mesure
- `last_battery` : Dernière batterie reçue
- `last_battery` est mis à jour à chaque mesure reçue

---

## 🔍 Pourquoi ne voyez-vous rien dans l'interface ?

### Scénarios possibles

#### 1. Le dispositif n'a jamais envoyé de mesure
- **Cause** : Dispositif en mode USB ou jamais démarré en mode normal
- **Solution** : Vérifier les logs du firmware (Serial Monitor)

#### 2. Le dispositif envoie mais l'interface ne rafraîchit pas
- **Cause** : Pas de rafraîchissement automatique sur la page devices
- **Solution** : Rafraîchir manuellement (F5) ou ajouter un polling

#### 3. Le dispositif envoie mais l'API ne reçoit pas
- **Cause** : Erreur réseau, API down, problème de configuration
- **Solution** : Vérifier les logs API, tester l'endpoint

#### 4. Les données sont dans la DB mais pas affichées
- **Cause** : Problème de requête SQL ou de format
- **Solution** : Vérifier directement dans la base de données

---

## ✅ Vérifications à faire

### 1. Vérifier si le dispositif envoie des données
```bash
# Dans les logs Serial du firmware, chercher :
[API] Mesure envoyée avec succès
```

### 2. Vérifier dans la base de données
```sql
SELECT * FROM measurements 
WHERE device_id = (SELECT id FROM devices WHERE sim_iccid = 'VOTRE_ICCID')
ORDER BY timestamp DESC 
LIMIT 10;

SELECT last_seen, last_battery FROM devices 
WHERE sim_iccid = 'VOTRE_ICCID';
```

### 3. Vérifier les logs API
- Vérifier les logs PHP/API pour voir si les POST arrivent
- Vérifier les erreurs éventuelles

### 4. Tester l'endpoint manuellement
```bash
curl -X POST https://ott-jbln.onrender.com/api.php/devices/measurements \
  -H "Content-Type: application/json" \
  -H "X-Device-ICCID: VOTRE_ICCID" \
  -d '{"sim_iccid":"VOTRE_ICCID","flowrate":10.5,"battery":85,"rssi":-80}'
```

---

## 🎯 Recommandations

### Pour éviter les coûts pendant les tests
1. **Utiliser le mode USB streaming** : Pas de connexion réseau
2. **Augmenter l'intervalle de sommeil** : Moins de mesures = moins de données
3. **Désactiver temporairement le modem** : Modifier le firmware pour ne pas appeler `startModem()`

### Pour voir les données dans l'interface
1. **Ajouter un rafraîchissement automatique** sur la page devices
2. **Afficher un indicateur de dernière mise à jour**
3. **Afficher les mesures récentes** dans le modal détails

### Pour déboguer
1. **Activer les logs détaillés** dans le firmware
2. **Vérifier les logs API** côté serveur
3. **Vérifier directement la base de données**

---

## 📝 Résumé

| Mode | Connexion réseau | Coûts | Données visibles |
|------|------------------|-------|------------------|
| **USB Streaming** | ❌ Non | ✅ Aucun | Via Serial USB uniquement |
| **Mode normal** | ✅ Oui (GPRS) | ⚠️ ~8.6 MB/mois | Dans l'interface (si rafraîchi) |

**Le dispositif envoie des données sur le réseau uniquement en mode normal (hors USB).**

**L'interface devrait afficher les données, mais il faut vérifier :**
- Si le dispositif envoie vraiment (logs firmware)
- Si l'API reçoit (logs API)
- Si l'interface rafraîchit (polling automatique)

