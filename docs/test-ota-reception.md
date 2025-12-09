# Test de réception OTA sans capteur de pression

## ✅ Bonne nouvelle !

Le dispositif **PEUT DÉJÀ envoyer toutes ses données même sans capteur de pression** !

### 📋 Ce qui sera envoyé :

Le firmware envoie automatiquement :

1. **Identifiants** :
   - ✅ `sim_iccid` (identifiant SIM)
   - ✅ `device_serial` (numéro de série)
   - ✅ `device_name` (nom du dispositif)
   - ✅ `firmware_version` (version du firmware)

2. **Mesures** :
   - ✅ `battery_percent` / `battery` (% batterie)
   - ✅ `rssi` / `signal_strength` (force du signal)
   - ✅ `flowrate` / `flow_lpm` (sera **0** sans capteur, mais c'est normal ✅)
   - ✅ `latitude` / `longitude` (GPS si disponible)

3. **Métadonnées** :
   - ✅ `timestamp` (heure actuelle automatique)
   - ✅ `status` (BOOT, EVENT, TIMER, USB_STREAM)
   - ✅ `sleep_minutes` (configuration)
   - ✅ `measurement_duration_ms` (configuration)

### 🔍 Comment vérifier que ça fonctionne :

#### 1. Dans la base de données PostgreSQL :

```bash
# Se connecter à la base
psql -h votre-host -U votre-user -d votre-db

# Voir les dernières mesures reçues
SELECT id, device_id, timestamp, flowrate, battery, signal_strength 
FROM measurements 
ORDER BY timestamp DESC 
LIMIT 10;

# Voir les dispositifs et leur dernière mise à jour
SELECT id, sim_iccid, device_name, last_seen, last_battery, last_rssi 
FROM devices 
ORDER BY last_seen DESC;
```

#### 2. Dans le dashboard (frontend) :

1. Allez sur la page **Dispositifs**
2. Vous devriez voir votre dispositif apparaître
3. Vérifiez que :
   - ✅ `last_seen` est mis à jour (heure actuelle)
   - ✅ `battery` est affiché
   - ✅ `rssi` est affiché
   - ⚠️ `flowrate` sera **0** (normal sans capteur)

#### 3. Via l'API directement :

```bash
# Récupérer les dernières mesures d'un dispositif
curl -X GET "https://ott-jbln.onrender.com/api.php/devices/measurements?iccid=VOTRE_ICCID&limit=10"

# Voir un dispositif spécifique
curl -X GET "https://ott-jbln.onrender.com/api.php/devices?iccid=VOTRE_ICCID"
```

### 📊 Script SQL de test :

Un script SQL complet est disponible dans `scripts/test-ota-measurements.sql` pour :
- Voir les dernières mesures
- Voir les dispositifs et leur statut
- Compter les mesures par dispositif
- Vérifier un dispositif spécifique

### ⚙️ Quand le dispositif envoie :

1. **Au démarrage (BOOT)** : Dès que le dispositif démarre
2. **Sur événement (EVENT)** : Quand le flux d'air change significativement
3. **Sur timer (TIMER)** : Selon la configuration `sleep_minutes`
4. **En mode USB (USB_STREAM)** : Si connecté en USB

### 🚨 Points d'attention :

- ⚠️ Le `flowrate` sera **0** sans capteur (normal, pas une erreur)
- ⚠️ Le dispositif doit être connecté au réseau 4G/LTE pour envoyer
- ⚠️ Le SIM doit être activé avec un forfait data
- ⚠️ Le firmware doit être correctement flashé avec l'ICCID configuré

### 🔧 Troubleshooting :

Si les mesures n'apparaissent pas :

1. **Vérifiez la connexion réseau** :
   - Le modem est-il connecté au réseau ?
   - Le SIM est-il activé ?

2. **Vérifiez l'ICCID** :
   - L'ICCID est-il correctement configuré dans le firmware ?
   - L'ICCID correspond-il à celui dans la base de données ?

3. **Vérifiez les logs du dispositif** :
   - Connectez-vous en USB et regardez les logs série
   - Cherchez les messages `[API] ✅ Mesure envoyée avec succès`

4. **Vérifiez l'API backend** :
   - L'API est-elle accessible depuis Internet ?
   - Y a-t-il des erreurs dans les logs serveur ?

### 📝 Notes :

- Le firmware envoie déjà toutes les données nécessaires même sans capteur
- L'API accepte `flowrate = 0` sans problème
- Toutes les autres données (battery, rssi, GPS, timestamp) seront présentes
- Le dispositif sera visible dans le dashboard même sans capteur

