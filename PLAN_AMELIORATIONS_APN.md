# Plan d'améliorations supplémentaires - Gestion APN

## 🔍 Points manquants identifiés

### 1. ❌ Validation APN vide avant utilisation dans `startModem()`

**Problème actuel :**
- Dans `startModem()`, on utilise `apnToUse` sans vérifier s'il est vide
- Si `NETWORK_APN` est vide (corruption NVS, bug), `setApn("")` retourne `false` mais on continue
- Pas de fallback vers APN par défaut si `apnToUse` est vide

**Solution proposée :**
```cpp
// Dans startModem(), après détermination de apnToUse
if (apnToUse.length() == 0) {
  Serial.println(F("[MODEM] ⚠️ APN vide détecté → Utilisation valeur par défaut"));
  apnToUse = String(F(OTT_DEFAULT_APN));
  NETWORK_APN = apnToUse;
  apnLoadedFromNVS = false;  // Réinitialiser car APN invalide
}
```

---

### 2. ❌ Validation APN après chargement depuis NVS

**Problème actuel :**
- Si l'APN chargé depuis NVS est vide ou corrompu, on le garde tel quel
- Pas de validation de format ou de longueur après chargement
- `sanitizeString` est appelé lors de UPDATE_CONFIG mais pas lors du chargement NVS

**Solution proposée :**
```cpp
// Dans loadConfig(), après chargement depuis NVS
if (savedApn.length() > 0) {
  // Valider et sanitizer l'APN chargé
  if (savedApn.length() > 64) {
    Serial.printf("[CFG] ⚠️ APN NVS trop long (%d) → Tronqué à 64 caractères\n", savedApn.length());
    savedApn = savedApn.substring(0, 64);
  }
  NETWORK_APN = savedApn;
  apnLoadedFromNVS = true;
  Serial.printf("[CFG] 📥 APN chargé depuis NVS: \"%s\" (considéré comme configuré)\n", NETWORK_APN.c_str());
} else {
  // APN vide en NVS → utiliser valeur par défaut
  NETWORK_APN = String(F(OTT_DEFAULT_APN));
  apnLoadedFromNVS = false;
  Serial.printf("[CFG] 📥 APN non trouvé en NVS → Utilisation valeur par défaut: \"%s\"\n", NETWORK_APN.c_str());
}
```

---

### 3. ⚠️ Vérification retour de `setApn()` dans `startModem()`

**Problème actuel :**
- Dans `startModem()`, on appelle `setApn(apnToUse)` mais on ne vérifie pas le retour
- Si la configuration échoue, on continue quand même avec un APN peut-être invalide

**Solution proposée :**
```cpp
// Dans startModem(), après détermination de apnToUse
Serial.printf("[MODEM] 📡 Configuration APN: %s (type: IP pour internet)\n", apnToUse.c_str());
if (!setApn(apnToUse)) {
  Serial.printf("[MODEM] ⚠️ Échec configuration APN \"%s\" → Retry avec APN par défaut\n", apnToUse.c_str());
  String fallbackApn = String(F(OTT_DEFAULT_APN));
  if (setApn(fallbackApn)) {
    apnToUse = fallbackApn;
    NETWORK_APN = fallbackApn;
    Serial.printf("[MODEM] ✅ APN par défaut configuré: %s\n", fallbackApn.c_str());
  } else {
    Serial.println(F("[MODEM] ❌ Échec configuration même avec APN par défaut"));
    // Continue quand même, le modem peut avoir un APN par défaut
  }
}
```

---

### 4. ⚠️ Validation format APN (caractères valides)

**Problème actuel :**
- `sanitizeString()` vérifie seulement la longueur
- Pas de validation des caractères valides pour un APN
- Un APN peut contenir des caractères spéciaux qui posent problème dans les commandes AT

**Note :** 
- Les APN peuvent contenir : lettres, chiffres, points, tirets
- Caractères problématiques : guillemets, virgules, espaces en début/fin
- Les commandes AT utilisent des guillemets, donc les guillemets dans l'APN poseraient problème

**Solution proposée (optionnelle, validation stricte) :**
```cpp
bool isValidApnFormat(const String& apn) {
  if (apn.length() == 0 || apn.length() > 64) {
    return false;
  }
  // Vérifier caractères valides : lettres, chiffres, points, tirets
  for (size_t i = 0; i < apn.length(); i++) {
    char c = apn.charAt(i);
    if (!isalnum(c) && c != '.' && c != '-') {
      return false;
    }
  }
  // Pas d'espaces en début/fin
  if (apn.trim() != apn) {
    return false;
  }
  return true;
}
```

**Impact :** Faible - la plupart des APN sont valides. Mais utile pour détecter corruption.

---

### 5. ⚠️ Gestion erreur si APN NVS corrompu (valeurs extrêmes)

**Problème actuel :**
- Si NVS contient un APN avec des caractères binaires corrompus, on le charge tel quel
- Pas de détection de corruption évidente

**Solution proposée :**
```cpp
// Dans loadConfig()
String savedApn = prefs.getString("apn", "");
if (savedApn.length() > 0) {
  // Vérifier que l'APN contient des caractères imprimables valides
  bool isValid = true;
  for (size_t i = 0; i < savedApn.length(); i++) {
    char c = savedApn.charAt(i);
    // Caractère imprimable ASCII (32-126) sauf caractères problématiques
    if (c < 32 || c > 126 || c == '"' || c == ',') {
      isValid = false;
      break;
    }
  }
  
  if (!isValid || savedApn.length() > 64) {
    Serial.printf("[CFG] ⚠️ APN NVS invalide/corrompu (longueur: %d) → Utilisation valeur par défaut\n", savedApn.length());
    NETWORK_APN = String(F(OTT_DEFAULT_APN));
    apnLoadedFromNVS = false;
    // Optionnel : effacer la valeur corrompue
    prefs.remove("apn");
  } else {
    NETWORK_APN = savedApn;
    apnLoadedFromNVS = true;
    Serial.printf("[CFG] 📥 APN chargé depuis NVS: \"%s\" (considéré comme configuré)\n", NETWORK_APN.c_str());
  }
}
```

---

### 6. ✅ Déjà géré : Validation longueur dans UPDATE_CONFIG

**Status :** ✅ Déjà implémenté
- `UPDATE_CONFIG` vérifie `newApn.length() > 0 && newApn.length() <= 64`
- Utilise `sanitizeString()` pour tronquer si nécessaire

---

### 7. ✅ Déjà géré : Validation dans `setApn()`

**Status :** ✅ Déjà implémenté
- `setApn()` vérifie `if (apn.length() == 0) return false;`
- Retourne `false` si APN vide

---

### 8. ⚠️ Gestion APN vide dans `connectData()`

**Problème actuel :**
- Dans `connectData()`, on met `apnList[0] = NETWORK_APN;`
- Si `NETWORK_APN` est vide, on essaie de se connecter avec un APN vide
- Pas de validation avant `gprsConnect()`

**Solution proposée :**
```cpp
// Dans connectData()
String apnList[3];
uint8_t maxApnAttempts = 0;

// TOUJOURS essayer l'APN configuré en premier
if (NETWORK_APN.length() > 0) {
  apnList[0] = NETWORK_APN;
  maxApnAttempts = 1;
} else {
  // APN vide → utiliser valeur par défaut
  Serial.println(F("[MODEM] ⚠️ NETWORK_APN vide → Utilisation valeur par défaut"));
  apnList[0] = String(F(OTT_DEFAULT_APN));
  maxApnAttempts = 1;
}
```

---

## 📊 Priorité des améliorations

### 🔴 CRITIQUE (à implémenter)
1. **Validation APN vide dans `startModem()`** - Fallback vers défaut si vide
2. **Validation APN après chargement NVS** - Tronquer si trop long
3. **Gestion APN vide dans `connectData()`** - Fallback vers défaut

### 🟡 IMPORTANT (recommandé)
4. **Vérification retour `setApn()` dans `startModem()`** - Logger si échec
5. **Validation format APN NVS** - Détecter corruption évidente

### 🟢 OPTIONNEL (nice to have)
6. **Validation format strict APN** - Caractères valides (faible impact, APN généralement valides)

---

## 🎯 Recommandation

**Implémenter les 3 points CRITIQUES** pour garantir qu'un APN valide est toujours utilisé, même en cas de corruption NVS ou de bug.

Les autres points sont des améliorations de robustesse mais moins critiques car :
- Les APN sont généralement valides (pas de corruption fréquente)
- `setApn()` gère déjà les APN vides
- La validation stricte peut être trop restrictive pour certains APN exotiques

---

## ✅ Validation après implémentation

Tester les cas suivants :
1. ✅ NVS vide → Utilise APN par défaut
2. ✅ NVS avec APN valide → Utilise APN NVS
3. ✅ NVS avec APN vide → Utilise APN par défaut
4. ✅ NVS avec APN trop long (>64) → Tronqué
5. ✅ NVS avec APN corrompu (caractères binaires) → Utilise APN par défaut
6. ✅ `setApn()` échoue → Logger erreur, continue avec défaut si possible
