# PLAN DE REVISION LOGIQUE APN - FIRMWARE OTT

## 🔍 ANALYSE ACTUELLE

### Points d'entrée de modification APN
1. **`loadConfig()`** : Charge depuis NVS ou utilise valeur par défaut
2. **`startModem()`** : Détection automatique opérateur/SIM → peut modifier APN
3. **`attachNetworkWithRetry()`** : Correction APN si REG_DENIED → modifie NETWORK_APN
4. **`connectData()`** : Liste de fallback APN (mais ne modifie pas NETWORK_APN directement)
5. **`UPDATE_CONFIG` (USB/OTA)** : Configuration manuelle → définit `apnManual=true`
6. **`RESET_CONFIG`** : Remet à zéro → `apnManual=false`, APN par défaut
7. **`saveNetworkParams()`** : Sauvegarde opérateur/APN détectés → peut modifier NETWORK_APN

### Variables d'état critiques
- `NETWORK_APN` : APN actuel
- `apnManual` : Flag indiquant APN configuré manuellement (priorité absolue)
- `apnLoadedFromNVS` : Flag indiquant APN chargé depuis NVS (donc configuré)
- `DETECTED_OPERATOR` : Opérateur sauvegardé (MCC+MNC)

---

## 📋 CAS POSSIBLES À GÉRER

### CAS 1 : BOOT INITIAL (premier flash)
- **État NVS** : Vide
- **APN initial** : `OTT_DEFAULT_APN` ("free")
- **apnManual** : `false`
- **apnLoadedFromNVS** : `false`
- **DETECTED_OPERATOR** : Vide
- **Action attendue** : Détecter opérateur/SIM et utiliser APN recommandé

### CAS 2 : APN MANUEL configuré via USB/OTA
- **État NVS** : APN sauvegardé ("free" ou autre)
- **APN initial** : Depuis NVS
- **apnManual** : `true`
- **apnLoadedFromNVS** : `true`
- **Action attendue** : **JAMAIS modifier l'APN**, même si opérateur différent

### CAS 3 : APN AUTO sauvegardé (détection précédente)
- **État NVS** : APN sauvegardé ("orange" par ex)
- **APN initial** : Depuis NVS
- **apnManual** : `false`
- **apnLoadedFromNVS** : `true`
- **Action attendue** : **Conserver APN sauvegardé**, même si opérateur change

### CAS 4 : APN par défaut sauvegardé en NVS (cas limite)
- **État NVS** : APN = "free" (valeur par défaut mais sauvegardée)
- **APN initial** : "free" depuis NVS
- **apnManual** : `false`
- **apnLoadedFromNVS** : `true`
- **Action attendue** : **Conserver "free"** même si opérateur = Orange

### CAS 5 : Changement de carte SIM
- **État NVS** : APN/opérateur sauvegardés pour ancienne SIM
- **APN initial** : Depuis NVS (pour ancienne SIM)
- **apnManual** : `false`
- **apnLoadedFromNVS** : `true`
- **Nouveau opérateur** : Différent de DETECTED_OPERATOR
- **Action attendue** : 
  - Si `apnManual=true` → conserver APN
  - Si `apnManual=false` → détecter nouveau opérateur et utiliser son APN

### CAS 6 : REG_DENIED lors attachement réseau
- **APN utilisé** : Peut être incorrect
- **Action actuelle** : Correction automatique dans `attachNetworkWithRetry()`
- **Problème** : Modifie `NETWORK_APN` sans vérifier `apnManual`
- **Action attendue** :
  - Si `apnManual=true` → **NE PAS corriger**, seulement logger l'erreur
  - Si `apnManual=false` → Corriger si nécessaire

### CAS 7 : Roaming (carte SIM ≠ opérateur réseau)
- **Carte SIM** : Free (20815)
- **Réseau** : Orange (20801)
- **APN correct** : "free" (de la carte SIM)
- **Action attendue** : Utiliser APN de la carte SIM, pas du réseau

### CAS 8 : RESET_CONFIG
- **Action** : Remet tous les paramètres à zéro
- **apnManual** : `false`
- **apnLoadedFromNVS** : `false` (au prochain boot)
- **APN** : `OTT_DEFAULT_APN`
- **Action attendue** : Comportement comme CAS 1

---

## 🎯 HIÉRARCHIE DE PRIORITÉ PROPOSÉE

```
NIVEAU 1 : APN MANUEL (priorité absolue)
├─ Si apnManual = true
│  └─ CONSERVER NETWORK_APN tel quel, JAMAIS le modifier
│  └─ NE PAS utiliser détection automatique
│  └─ NE PAS corriger même si REG_DENIED

NIVEAU 2 : APN SAUVEGARDÉ EN NVS (apnLoadedFromNVS = true)
├─ Si apnManual = false ET apnLoadedFromNVS = true
│  └─ CONSERVER NETWORK_APN sauvegardé
│  └─ NE PAS utiliser détection automatique SAUF si changement d'opérateur détecté
│  └─ Correction REG_DENIED autorisée seulement si opérateur différent

NIVEAU 3 : DÉTECTION AUTOMATIQUE (apnLoadedFromNVS = false)
├─ Si apnManual = false ET apnLoadedFromNVS = false
│  ├─ Si opérateur sauvegardé disponible
│  │  └─ Vérifier si APN actuel correspond
│  │     ├─ OUI → conserver
│  │     └─ NON → utiliser APN recommandé pour opérateur sauvegardé
│  ├─ Si carte SIM détectée
│  │  └─ Utiliser APN de la carte SIM (pas du réseau en roaming)
│  ├─ Si opérateur réseau détecté
│  │  └─ Utiliser APN recommandé pour cet opérateur
│  └─ Sinon
│     └─ Utiliser APN par défaut
```

---

## 🔧 MODIFICATIONS À APPORTER

### 1. `loadConfig()` ✅ (Déjà fait)
- Marquer `apnLoadedFromNVS = true` si APN chargé depuis NVS

### 2. `startModem()` ⚠️ (À améliorer)
- **Problème actuel** : Logique complexe avec plusieurs chemins
- **Amélioration** : Simplifier selon hiérarchie ci-dessus
- **Cas spéciaux** :
  - Si changement d'opérateur détecté ET `apnLoadedFromNVS=true` ET `apnManual=false` → utiliser nouveau APN
  - Sinon, respecter hiérarchie

### 3. `attachNetworkWithRetry()` ❌ (À corriger)
- **Problème** : Modifie `NETWORK_APN` sans vérifier `apnManual`
- **Correction** :
  ```cpp
  if (reg == REG_DENIED && retryCount == 0) {
    // SEULEMENT si APN non manuel
    if (!apnManual) {
      // ... logique de correction ...
      NETWORK_APN = apnToUse;  // OK seulement si apnManual=false
    } else {
      Serial.println("[MODEM] 🔒 APN manuel - Correction automatique désactivée");
    }
  }
  ```

### 4. `saveNetworkParams()` ⚠️ (À améliorer)
- **Problème actuel** : Vérifie seulement `apnManual`
- **Amélioration** : 
  ```cpp
  void saveNetworkParams(const String& oper, const String& apn) {
    if (oper.length() > 0) {
      DETECTED_OPERATOR = oper;
    }
    // Ne sauvegarder APN que si:
    // - APN non manuel (pas de forçage)
    // - ET (pas d'APN déjà sauvegardé OU opérateur différent = changement SIM)
    if (apn.length() > 0 && !apnManual) {
      // Si changement d'opérateur détecté → mettre à jour APN
      if (DETECTED_OPERATOR != oper || !apnLoadedFromNVS) {
        NETWORK_APN = apn;
      }
      // Sinon, conserver APN existant même si différent
    }
    saveConfig();
  }
  ```

### 5. `connectData()` ✅ (OK actuellement)
- Ne modifie pas `NETWORK_APN` directement, utilise seulement liste de fallback
- Vérifie déjà `apnManual` pour ne pas utiliser fallback

### 6. `UPDATE_CONFIG` ✅ (OK actuellement)
- Définit `apnManual = true` → correct

### 7. `RESET_CONFIG` ✅ (OK actuellement)
- Remet `apnManual = false` → correct

---

## 📊 MATRICE DE DÉCISION

| Situation | apnManual | apnLoadedFromNVS | Opérateur détecté | Action |
|-----------|-----------|------------------|-------------------|--------|
| Boot premier flash | false | false | Orange | Utiliser "orange" |
| Boot premier flash | false | false | Free | Utiliser "free" |
| APN manuel "free" | **true** | true | Orange | **Conserver "free"** |
| APN auto "orange" sauvegardé | false | **true** | Orange | Conserver "orange" |
| APN auto "free" sauvegardé | false | **true** | Orange | **Conserver "free"** |
| Changement SIM (Orange→Free) | false | true | Free (différent) | Utiliser "free" |
| Changement SIM (Orange→Free) | **true** | true | Free (différent) | **Conserver APN manuel** |
| REG_DENIED avec APN manuel | **true** | true | - | **NE PAS corriger** |
| REG_DENIED sans APN manuel | false | true | Orange | Corriger si nécessaire |
| Roaming (Free sur Orange) | false | false | Orange (réseau) | Utiliser "free" (SIM) |

---

## ⚠️ CAS LIMITES IDENTIFIÉS

### Cas limite 1 : Détection SIM ambiguë (Orange/Free)
- **Problème** : Préfixes ICCID partagés
- **Solution actuelle** : Utilise APN par défaut comme indice
- **Risque** : Si APN par défaut = "free" mais carte = Orange → mauvaise détection
- **Amélioration** : Privilégier IMSI (plus fiable)

### Cas limite 2 : APN sauvegardé mais opérateur change
- **Exemple** : APN "orange" sauvegardé, nouvelle carte Free
- **Question** : Conserver "orange" ou utiliser "free" ?
- **Réponse proposée** : 
  - Si `apnManual=true` → conserver "orange"
  - Si `apnManual=false` → détecter changement et utiliser "free"

### Cas limite 3 : APN par défaut sauvegardé = valeur par défaut
- **Exemple** : APN "free" sauvegardé, valeur par défaut = "free"
- **Problème** : Impossible de distinguer "non configuré" vs "configuré à la valeur par défaut"
- **Solution actuelle** : `apnLoadedFromNVS` distingue les deux
- **Status** : ✅ Résolu

---

## ✅ VALIDATION DES CORRECTIONS

### Tests à effectuer
1. ✅ Boot avec NVS vide → détection automatique
2. ✅ Configuration manuelle "free" → conserver même si Orange détecté
3. ✅ APN "free" sauvegardé + opérateur Orange sauvegardé → conserver "free"
4. ✅ Changement SIM (Orange→Free) sans apnManual → utiliser "free"
5. ✅ Changement SIM (Orange→Free) avec apnManual → conserver APN manuel
6. ✅ REG_DENIED avec apnManual → ne pas corriger automatiquement
7. ✅ REG_DENIED sans apnManual → corriger si nécessaire
8. ✅ Roaming (Free sur Orange) → utiliser APN "free" de la SIM

---

## 📝 RÉSUMÉ DES MODIFICATIONS

1. **`attachNetworkWithRetry()`** : Ajouter vérification `apnManual` avant correction APN
2. **`saveNetworkParams()`** : Améliorer logique pour détecter changement d'opérateur
3. **`startModem()`** : Clarifier commentaires et logique selon hiérarchie
4. **Tests** : Valider tous les cas ci-dessus

---

## 🎯 RÈGLE D'OR

> **"Si l'utilisateur a configuré un APN (manuellement ou via NVS), le conserver sauf changement explicite de carte SIM ET apnManual=false"**
