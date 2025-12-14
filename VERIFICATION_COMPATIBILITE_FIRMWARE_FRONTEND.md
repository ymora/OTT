# Vérification Compatibilité Firmware ↔ Frontend

## ✅ Commandes supportées par le Firmware

1. **UPDATE_CONFIG** - Avec payload JSON
2. **RESET_CONFIG** - Sans payload
3. **SET_SLEEP_SECONDS** - Avec payload
4. **UPDATE_CALIBRATION** - Avec payload
5. **OTA_REQUEST** - Avec payload optionnel
6. **GET_STATUS / GET_CONFIG** - Sans payload
7. **PING** - Sans payload

---

## ✅ Commandes envoyées par le Frontend

### 1. UPDATE_CONFIG
**Format Frontend :**
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

**Parsing Firmware :**
```cpp
// Ligne 1431-1441
String cmdVerb = cmdDoc["command"].as<String>();
cmd.verb = cmdVerb;

if (cmdDoc.containsKey("payload") || cmdDoc.containsKey("config")) {
  String payloadStr;
  serializeJson(cmdDoc, payloadStr);
  cmd.payloadRaw = payloadStr;
}
```

✅ **COMPATIBLE** - Le firmware récupère `payload` correctement.

---

### 2. RESET_CONFIG
**Format Frontend :**
```json
{
  "command": "RESET_CONFIG"
}
```

**Parsing Firmware :**
```cpp
// Ligne 3506
else if (cmd.verb == "RESET_CONFIG") {
  // Pas de vérification de payload
  // Réinitialise directement
}
```

✅ **COMPATIBLE** - Le firmware ne nécessite pas de payload.

---

## 🔍 Champs UPDATE_CONFIG - Comparaison

### Frontend envoie :
- `apn`
- `sim_pin`
- `sleep_seconds`
- `gps_enabled`
- `roaming_enabled`
- `send_every_n_wakeups`
- `serial`
- `iccid`

### Firmware attend (ligne 3303-3450) :
- `apn` ✅
- `sim_pin` ✅ (cherche "sim_pin")
- `sleep_seconds` ✅
- `gps_enabled` ✅
- `roaming_enabled` ✅
- `send_every_n_wakeups` ✅ (cherche "send_every_n_wakeups")
- `serial` ✅
- `iccid` ✅

✅ **TOUS LES CHAMPS SONT COMPATIBLES**

---

## ⚠️ Points à vérifier

### 1. Format de parsing payload

**Firmware (ligne 3287-3288) :**
```cpp
DynamicJsonDocument payloadDoc(512);
bool hasPayload = (cmd.payloadRaw.length() > 0 && deserializeJson(payloadDoc, cmd.payloadRaw) == DeserializationError::Ok);
```

**Problème potentiel :** Le firmware désérialise `cmd.payloadRaw` qui contient le JSON complet (avec "command" et "payload"), mais il cherche les champs directement dans `payloadDoc`.

**Analyse :** 
- Frontend envoie : `{"command": "UPDATE_CONFIG", "payload": {...}}`
- Firmware stocke dans `cmd.payloadRaw` : le JSON complet
- Firmware désérialise dans `payloadDoc` : le JSON complet
- Firmware cherche : `payloadDoc["apn"]` alors que c'est dans `payloadDoc["payload"]["apn"]`

❌ **INCOMPATIBLE DÉTECTÉ !**

---

## 🔧 Correction nécessaire

### Option 1 : Modifier le firmware (recommandé)

**Code actuel (ligne 1444-1446) :**
```cpp
if (cmdDoc.containsKey("payload") || cmdDoc.containsKey("config")) {
  String payloadStr;
  serializeJson(cmdDoc, payloadStr);  // ❌ Sérialise TOUT le JSON
  cmd.payloadRaw = payloadStr;
}
```

**Correction :**
```cpp
if (cmdDoc.containsKey("payload")) {
  // Extraire uniquement le payload
  serializeJson(cmdDoc["payload"], cmd.payloadRaw);
} else if (cmdDoc.containsKey("config")) {
  serializeJson(cmdDoc["config"], cmd.payloadRaw);
}
```

### Option 2 : Modifier le frontend

**Changer le format pour :**
```json
{
  "command": "UPDATE_CONFIG",
  "payload": {
    "apn": "free",
    ...
  }
}
```

Mais extraire seulement le payload avant désérialisation dans le firmware.

---

## ✅ Vérification finale - Format actuel

Laissez-moi vérifier comment le firmware parse réellement...

**Code firmware ligne 1444-1446 :**
```cpp
if (cmdDoc.containsKey("payload") || cmdDoc.containsKey("config")) {
  String payloadStr;
  serializeJson(cmdDoc, payloadStr);  // Sérialise cmdDoc complet
  cmd.payloadRaw = payloadStr;
}
```

Puis ligne 3287-3288 :
```cpp
DynamicJsonDocument payloadDoc(512);
bool hasPayload = (cmd.payloadRaw.length() > 0 && deserializeJson(payloadDoc, cmd.payloadRaw) == DeserializationError::Ok);
```

Donc `payloadDoc` contient : `{"command": "UPDATE_CONFIG", "payload": {...}}`

Ensuite ligne 3324 :
```cpp
if (payloadDoc.containsKey("apn")) {
  String newApn = payloadDoc["apn"].as<String>();
```

❌ **Le firmware cherche `payloadDoc["apn"]` mais le champ est dans `payloadDoc["payload"]["apn"]` !**

---

## 🔧 CORRECTION NÉCESSAIRE

Il faut modifier le firmware pour extraire correctement le payload.

**Ligne 1444-1446 à remplacer par :**
```cpp
if (cmdDoc.containsKey("payload")) {
  // Extraire uniquement le payload, pas le JSON complet
  JsonObject payloadObj = cmdDoc["payload"].as<JsonObject>();
  serializeJson(payloadObj, cmd.payloadRaw);
} else if (cmdDoc.containsKey("config")) {
  JsonObject configObj = cmdDoc["config"].as<JsonObject>();
  serializeJson(configObj, cmd.payloadRaw);
}
```

OU modifier le parsing du payload (ligne 3287-3288) :
```cpp
DynamicJsonDocument payloadDoc(512);
bool hasPayload = false;
if (cmd.payloadRaw.length() > 0) {
  DeserializationError error = deserializeJson(payloadDoc, cmd.payloadRaw);
  if (error == DeserializationError::Ok) {
    // Si le payload contient "payload", extraire ce sous-objet
    if (payloadDoc.containsKey("payload")) {
      JsonObject nestedPayload = payloadDoc["payload"].as<JsonObject>();
      payloadDoc.clear();
      payloadDoc = nestedPayload;  // Remplacer par le payload réel
    }
    hasPayload = true;
  }
}
```

**Mais la première solution (extraire seulement le payload lors de la sérialisation) est plus propre.**
