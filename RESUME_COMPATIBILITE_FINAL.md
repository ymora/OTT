# Résumé Final - Compatibilité Firmware ↔ Frontend

## ✅ Correction appliquée

### Problème identifié
Le firmware sérialisait le JSON complet (`{"command": "UPDATE_CONFIG", "payload": {...}}`) dans `cmd.payloadRaw`, puis cherchait les champs directement dans le payload désérialisé, ce qui ne fonctionnait pas.

### Solution appliquée
**Ligne 1444-1448 :** Modification pour extraire uniquement le payload :
```cpp
if (cmdDoc.containsKey("payload")) {
  JsonObject payloadObj = cmdDoc["payload"].as<JsonObject>();
  serializeJson(payloadObj, cmd.payloadRaw);  // ✅ Sérialise seulement le payload
} else if (cmdDoc.containsKey("config")) {
  JsonObject configObj = cmdDoc["config"].as<JsonObject>();
  serializeJson(configObj, cmd.payloadRaw);
}
```

✅ **CORRIGÉ** - Le firmware extrait maintenant correctement le payload.

---

## ✅ Commandes compatibles

### 1. UPDATE_CONFIG
**Frontend envoie :**
```json
{
  "command": "UPDATE_CONFIG",
  "payload": {
    "apn": "free",
    "sim_pin": "1234",
    "sleep_seconds": 300,
    "gps_enabled": false,
    "roaming_enabled": true,
    "send_every_n_wakeups": 1,
    "serial": "OTT-25-001",
    "iccid": "89330123456789012345"
  }
}
```

**Firmware attend :**
- ✅ `apn` → Cherche `payloadDoc["apn"]`
- ✅ `sim_pin` → Cherche `payloadDoc["sim_pin"]`
- ⚠️ `sleep_seconds` → Le firmware cherche `sleep_minutes` (ligne 3354)
- ✅ `gps_enabled` → Cherche `payloadDoc["gps_enabled"]`
- ✅ `roaming_enabled` → Cherche `payloadDoc["roaming_enabled"]`
- ✅ `send_every_n_wakeups` → Cherche `payloadDoc["send_every_n_wakeups"]`
- ✅ `serial` → Cherche `payloadDoc["serial"]`
- ✅ `iccid` → Cherche `payloadDoc["iccid"]`

### 2. RESET_CONFIG
**Frontend envoie :**
```json
{
  "command": "RESET_CONFIG"
}
```

**Firmware :**
- ✅ Pas de payload requis
- ✅ Traite correctement

---

## ⚠️ Incompatibilité détectée : sleep_seconds vs sleep_minutes

**Problème :**
- Frontend envoie : `sleep_seconds` (en secondes)
- Firmware cherche : `sleep_minutes` (en minutes)

**Solutions possibles :**

### Option 1 : Modifier le firmware (recommandé)
Ajouter support de `sleep_seconds` et conversion automatique :
```cpp
// Dans UPDATE_CONFIG, ligne 3353-3356
if (payloadDoc.containsKey("sleep_seconds")) {
  uint32_t seconds = payloadDoc["sleep_seconds"].as<uint32_t>();
  configuredSleepMinutes = std::max<uint32_t>(static_cast<uint32_t>(1), seconds / 60);
} else if (payloadDoc.containsKey("sleep_minutes")) {
  configuredSleepMinutes = std::max<uint32_t>(static_cast<uint32_t>(1), payloadDoc["sleep_minutes"].as<uint32_t>());
}
```

### Option 2 : Modifier le frontend
Envoyer `sleep_minutes` au lieu de `sleep_seconds`.

---

## 📊 Matrice de compatibilité finale

| Champ | Frontend envoie | Firmware attend | Status |
|-------|----------------|-----------------|--------|
| `apn` | ✅ | ✅ | ✅ Compatible |
| `sim_pin` | ✅ | ✅ | ✅ Compatible |
| `sleep_seconds` | ✅ | ❌ (cherche `sleep_minutes`) | ⚠️ Incompatible |
| `gps_enabled` | ✅ | ✅ | ✅ Compatible |
| `roaming_enabled` | ✅ | ✅ | ✅ Compatible |
| `send_every_n_wakeups` | ✅ | ✅ | ✅ Compatible |
| `serial` | ✅ | ✅ | ✅ Compatible |
| `iccid` | ✅ | ✅ | ✅ Compatible |

---

## ✅ Résumé

1. ✅ **Extraction payload** : Corrigée - Le firmware extrait maintenant correctement le payload
2. ⚠️ **sleep_seconds** : Incompatible - Le firmware cherche `sleep_minutes`
3. ✅ **Tous les autres champs** : Compatibles

---

## 🔧 Action recommandée

**Ajouter support `sleep_seconds` dans le firmware** pour être compatible avec le frontend qui envoie `sleep_seconds`.
