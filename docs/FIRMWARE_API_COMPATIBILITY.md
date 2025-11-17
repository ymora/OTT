# Compatibilité Firmware ↔ API

## ✅ Vérification de compatibilité

### Format ICCID

**Firmware :**
- Envoie `device_sim_iccid` dans le payload JSON
- Envoie `X-Device-ICCID` dans les headers HTTP
- Utilise `DEVICE_ICCID` (valeur par défaut ou NVS)

**API :**
- Accepte `device_sim_iccid` OU `sim_iccid` dans le payload
- Accepte `X-Device-ICCID` dans les headers (pour certaines routes)
- Validation : max 20 caractères (VARCHAR(20) en base)

**ICCID de démo :**
- Format : `893301230000000003` (18 caractères) ✅
- Compatible avec la base de données ✅

### Payload Mesures

**Firmware envoie :**
```json
{
  "device_sim_iccid": "893301230000000003",
  "device_serial": "OTT-MRS-003",
  "firmware_version": "3.0-rebuild",
  "status": "TIMER",
  "payload": {
    "flowrate": 2.3,
    "battery": 82.5,
    "signal_strength": -78,
    "signal_dbm": -78
  },
  "flowrate": 2.3,
  "battery": 82.5,
  "signal_dbm": -78
}
```

**API accepte :**
- `device_sim_iccid` OU `sim_iccid` ✅
- `flowrate` OU `flow` OU `payload.flowrate` ✅
- `battery` OU `payload.battery` ✅
- `signal_strength` OU `rssi` ✅
- `firmware_version` (optionnel) ✅

### Endpoints utilisés

1. **POST /api.php/devices/measurements**
   - Header : `X-Device-ICCID: 893301230000000003`
   - Body : JSON avec `device_sim_iccid`
   - ✅ Compatible

2. **GET /api.php/devices/{ICCID}/commands/pending**
   - Utilise `DEVICE_ICCID` dans l'URL
   - ✅ Compatible

3. **POST /api.php/devices/commands/ack**
   - Header : `X-Device-ICCID`
   - Body : `device_sim_iccid`
   - ✅ Compatible

4. **POST /api.php/devices/logs**
   - Header : `X-Device-ICCID`
   - Body : `device_sim_iccid` OU `sim_iccid`
   - ✅ Compatible

## ⚠️ Point d'attention

Le firmware n'utilise **PAS** `modem.getSimCCID()` pour lire l'ICCID réel de la SIM.

Il utilise uniquement :
- La valeur par défaut `OTT_DEFAULT_ICCID` (définie à la compilation)
- La valeur stockée en NVS (lue au boot)
- La valeur mise à jour via commande `UPDATE_CONFIG`

**Recommandation :** Si l'ICCID réel de la SIM est différent de celui configuré, le dispositif ne sera pas reconnu correctement.

**Solution :** Le firmware devrait lire l'ICCID réel de la SIM au démarrage et l'utiliser comme fallback si non configuré.

## ✅ Test de compatibilité

Pour tester avec un ICCID de démo `893301230000000003` :

1. **Configurer le firmware :**
   - Définir `#define OTT_DEFAULT_ICCID "893301230000000003"` OU
   - Envoyer commande `UPDATE_CONFIG` avec `{"iccid": "893301230000000003"}`

2. **Vérifier dans la base de données :**
   - Le dispositif doit exister avec `sim_iccid = '893301230000000003'`
   - Sinon, il sera créé automatiquement à la première mesure

3. **Vérifier le payload :**
   - Le firmware envoie `device_sim_iccid` dans le body
   - L'API accepte ce format ✅

## 🎯 Conclusion

**Compatibilité : ✅ OK**

- Format ICCID compatible (18 caractères, max 20)
- Payload compatible (API supporte les deux formats)
- Endpoints compatibles
- Headers HTTP compatibles

**Action recommandée :** Améliorer le firmware pour lire l'ICCID réel de la SIM au démarrage.

