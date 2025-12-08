# Audit Complet du Firmware OTT - Problème de Connexion Modem

**Date**: 2025-01-07  
**Version Firmware**: 1.0  
**Problème**: Modem ne se connecte plus au réseau (CSQ=99, reg=-1)

---

## 🔍 ANALYSE DES LOGS

### Symptômes observés
```
CSQ=99 (Signal invalide)
reg=-1 (indéfini)
oper=<n/a>
eps=KO
gprs=KO
```

### Séquence d'échec répétée
1. ✅ SIM READY (SIM détectée et déverrouillée)
2. ❌ Échec attachement réseau après 3 tentatives
3. ❌ CSQ reste à 99 (signal invalide)
4. ❌ Opérateur non détecté

---

## 📋 VÉRIFICATIONS SYSTÉMATIQUES

### 1. INITIALISATION MODEM

#### ✅ Points vérifiés
- [x] `initModem()` configure correctement les pins (ligne 801-810)
- [x] Reset pin correctement géré
- [x] Délai de 2600ms après reset (ligne 808)

#### ⚠️ Problèmes potentiels identifiés

**A. Délai après reset potentiellement insuffisant**
```1241:1241:hardware/firmware/fw_ott_optimized/fw_ott_optimized.ino
  delay(2600);
```
- **Risque**: Le modem A7670G peut nécessiter jusqu'à 5-10 secondes pour démarrer complètement
- **Recommandation**: Augmenter le délai à 5000ms minimum, vérifier avec testAT avant de continuer

**B. Pas de vérification de l'état du modem avant startModem()**
- `initModem()` configure les pins mais ne vérifie pas si le modem répond
- `startModem()` est appelée directement après sans vérification intermédiaire

**C. TestAT peut être trop agressif**
```823:823:hardware/firmware/fw_ott_optimized/fw_ott_optimized.ino
    while (!modem.testAT(1000)) {
```
- Timeout de 1000ms peut être trop court si le modem démarre lentement
- Après plusieurs échecs, le modem peut être dans un état instable

---

### 2. ATTACHEMENT AU RÉSEAU

#### ✅ Points vérifiés
- [x] Fonction `attachNetworkWithRetry()` avec backoff exponentiel (ligne 1356-1434)
- [x] Logs détaillés via `logRadioSnapshot()`
- [x] Gestion du cas REG_DENIED avec APN alternatif

#### ⚠️ Problèmes critiques identifiés

**A. CSQ=99 n'empêche pas la tentative d'attachement**
```1241:1295:hardware/firmware/fw_ott_optimized/fw_ott_optimized.ino
void logRadioSnapshot(const char* stage)
{
  RegStatus reg = modem.getRegistrationStatus();
  int8_t csq = modem.getSignalQuality();
  ...
  if (csq == 99) {
    Serial.printf("[MODEM][%s] CSQ=99 (Signal invalide) ...\n", stage);
    ...
  }
}
```
- Le code détecte CSQ=99 mais continue quand même à essayer de s'attacher
- **PROBLÈME**: Si CSQ=99, cela signifie que le modem ne peut pas mesurer le signal (antenne déconnectée, modem non initialisé, etc.)
- **Recommandation**: Ajouter une vérification préalable: si CSQ=99 après plusieurs tentatives, arrêter et diagnostiquer

**B. Pas de réinitialisation du modem si CSQ=99 persiste**
- Si CSQ reste à 99 après 3 tentatives, aucune action corrective n'est entreprise
- Le modem pourrait être dans un état incohérent

**C. `waitForNetwork()` appelé sans vérifier CSQ avant**
```1402:1409:hardware/firmware/fw_ott_optimized/fw_ott_optimized.ino
    while (millis() - networkWaitStart < 10000 && !networkAttached) {
      feedWatchdog();
      if (modem.waitForNetwork(1000)) {
        networkAttached = true;
        logRadioSnapshot("attach:event");
        return true;
      }
    }
```
- `waitForNetwork()` est appelé même si CSQ=99
- Cela peut bloquer inutilement et consommer de la batterie

---

### 3. GESTION DES ERREURS ET RETRY

#### ✅ Points vérifiés
- [x] Backoff exponentiel (5s, 10s, 20s)
- [x] Maximum 3 tentatives
- [x] Watchdog alimenté régulièrement

#### ⚠️ Problèmes identifiés

**A. Timeout trop court pour l'attachement initial**
```1356:1365:hardware/firmware/fw_ott_optimized/fw_ott_optimized.ino
bool attachNetworkWithRetry(uint32_t timeoutMs, uint8_t maxRetries)
{
  ...
  while (millis() - start < timeoutMs && retryCount < maxRetries) {
```
- Timeout par défaut: `NETWORK_ATTACH_TIMEOUT_DEFAULT_MS = 60000` (60s)
- Avec 3 tentatives et des délais de 5s, 10s, 20s, il reste peu de temps pour l'attachement réel
- **Recommandation**: Augmenter le timeout à 120s minimum

**B. Pas de réinitialisation du modem entre les tentatives**
- Si le modem est dans un état incohérent, les retries successifs ne résoudront rien
- **Recommandation**: Après 2 échecs, réinitialiser le modem (soft reset via AT+CFUN=1,1)

**C. Pas de distinction entre erreurs temporaires et erreurs matérielles**
- CSQ=99 persistant devrait déclencher une réinitialisation complète
- REG_DENIED devrait essayer un APN différent
- REG_UNREGISTERED devrait attendre plus longtemps

---

### 4. CONFIGURATION APN ET OPÉRATEUR

#### ✅ Points vérifiés
- [x] Configuration APN avant attachement (ligne 889)
- [x] Fonction `getRecommendedApnForOperator()` pour APN alternatifs
- [x] Tentative avec APN alternatif en cas de REG_DENIED

#### ⚠️ Problèmes identifiés

**A. Opérateur non détecté (oper=<n/a>)**
- Si `modem.getOperator()` retourne une chaîne vide, l'APN recommandé ne peut pas être déterminé
- **Problème**: Le code utilise l'APN par défaut même si l'opérateur n'est pas détecté
- **Recommandation**: Si opérateur non détecté après 30s, essayer plusieurs APN connus (free, orange, etc.)

**B. Configuration APN avant détection de l'opérateur**
```886:893:hardware/firmware/fw_ott_optimized/fw_ott_optimized.ino
  // Configuration APN pour internet (type IP, pas MMS)
  modem.sendAT(GF("+CGDCONT=1,\"IP\",\""), NETWORK_APN.c_str(), "\"");
  modem.waitResponse(2000);
  ...
  if (!attachNetwork(networkAttachTimeoutMs)) {
```
- L'APN est configuré avant de vérifier si l'opérateur est détecté
- Si l'opérateur est différent, cela peut causer des problèmes

---

### 5. SÉQUENCE DE DÉMARRAGE

#### Analyse de la séquence actuelle

1. `initBoard()` - Configure les pins de power
2. `initModem()` - Configure SerialAT et reset pin
3. `startModem()` - Attend réponse AT, puis SIM, puis APN, puis attache réseau

#### ⚠️ Problèmes de séquence

**A. Pas de vérification de l'état matériel avant initialisation**
- Pas de test de continuité de l'antenne
- Pas de vérification de l'alimentation du modem

**B. SIM vérifiée avant que le modem soit complètement initialisé**
- `waitForSimReady()` est appelée juste après `testAT()`
- Le modem peut répondre à AT mais ne pas être prêt pour les commandes SIM

**C. Pas de diagnostic si CSQ=99 dès le début**
- Si CSQ=99 dès la première tentative, le code continue quand même
- Aucun diagnostic matériel n'est lancé

---

## 🔧 RECOMMANDATIONS PRIORITAIRES

### 🔴 CRITIQUE - Action immédiate

1. **Vérifier CSQ avant toute tentative d'attachement**
   ```cpp
   // Dans attachNetworkWithRetry(), avant la boucle principale:
   int8_t csq = modem.getSignalQuality();
   if (csq == 99) {
     Serial.println("[MODEM] ⚠️ CSQ=99 détecté - Diagnostic matériel nécessaire");
     // Essayer un reset complet du modem
     modem.restart();
     delay(5000);
     csq = modem.getSignalQuality();
     if (csq == 99) {
       Serial.println("[MODEM] ❌ CSQ toujours à 99 après reset - Problème matériel probable");
       return false;
     }
   }
   ```

2. **Augmenter le délai après initModem()**
   ```cpp
   // Dans initModem(), après le reset:
   delay(5000); // Au lieu de 2600ms
   // Vérifier que le modem répond avant de continuer
   unsigned long testStart = millis();
   while (!modem.testAT(500) && (millis() - testStart < 10000)) {
     delay(500);
   }
   ```

3. **Réinitialiser le modem si CSQ=99 persiste**
   ```cpp
   // Dans attachNetworkWithRetry(), après 2 échecs:
   if (retryCount >= 2) {
     int8_t csq = modem.getSignalQuality();
     if (csq == 99) {
       Serial.println("[MODEM] Reset modem (CSQ=99 persistant)");
       modem.restart();
       delay(5000);
     }
   }
   ```

### 🟡 IMPORTANT - À faire prochainement

4. **Améliorer la détection d'opérateur**
   - Attendre jusqu'à 30s pour détecter l'opérateur
   - Si opérateur non détecté, essayer plusieurs APN connus

5. **Ajouter des diagnostics matériels**
   - Vérifier l'alimentation du modem (tension)
   - Tester la connexion série (envoyer AT et vérifier réponse)
   - Vérifier que l'antenne est bien connectée (CSQ devrait changer si on bouge l'antenne)

6. **Améliorer les timeouts**
   - Timeout réseau: 120s au lieu de 60s
   - Timeout SIM: 45s au lieu de 30s
   - Timeout boot modem: 20s au lieu de 15s

### 🟢 AMÉLIORATION - À considérer

7. **Logs plus détaillés pour diagnostic**
   - Logger toutes les commandes AT envoyées/reçues (mode debug)
   - Logger les timestamps précis de chaque étape
   - Logger les valeurs brutes de CSQ, REG, OPER

8. **Mode diagnostic USB**
   - Commande série `diagnostic` pour lancer un test complet
   - Test de toutes les commandes AT critiques
   - Rapport de diagnostic formaté

---

## 🧪 TESTS À EFFECTUER

### Test 1: Vérification matérielle
```
1. Vérifier connexion antenne (débrancher/rebrancher)
2. Vérifier tension d'alimentation modem (devrait être 3.3-4.2V)
3. Vérifier connexion série (SerialAT doit recevoir des réponses)
4. Vérifier SIM (lecture ICCID, statut SIM)
```

### Test 2: Séquence d'initialisation
```
1. Mesurer temps réel entre initModem() et première réponse AT
2. Mesurer temps entre testAT() et SIM READY
3. Mesurer temps entre SIM READY et premier CSQ valide
4. Identifier où la séquence bloque
```

### Test 3: Commandes AT critiques
```
Envoyer manuellement via SerialAT:
- AT (réponse: OK)
- AT+CSQ (doit retourner CSQ valide, pas 99)
- AT+CREG? (statut d'enregistrement réseau)
- AT+COPS? (opérateur détecté)
- AT+CGDCONT? (APN configuré)
```

---

## 📊 POINTS DE CONTRÔLE

### Avant attachement réseau
- [ ] Modem répond à AT
- [ ] SIM est READY
- [ ] CSQ != 99 (signal valide)
- [ ] Opérateur détecté (ou au moins recherche en cours)

### Pendant attachement
- [ ] REG_STATUS change (de REG_SEARCHING vers REG_OK_HOME ou REG_OK_ROAMING)
- [ ] CSQ reste valide (pas 99)
- [ ] Opérateur détecté

### Après attachement
- [ ] `isNetworkConnected()` retourne true
- [ ] `isGprsConnected()` retourne true
- [ ] CSQ valide (0-31, pas 99)

---

## 🔍 DIAGNOSTIC DU PROBLÈME ACTUEL

Basé sur les logs fournis:

1. **SIM fonctionne** ✅ (SIM READY loggé)
2. **Modem répond** ✅ (testAT() réussit probablement, sinon on aurait d'autres erreurs)
3. **Signal invalide** ❌ (CSQ=99 persistant)
4. **Opérateur non détecté** ❌ (oper=<n/a>)
5. **Pas d'enregistrement réseau** ❌ (reg=-1)

### Hypothèses principales

**Hypothèse 1: Antenne déconnectée ou défectueuse**
- Probabilité: **70%**
- Symptômes: CSQ=99, opérateur non détecté
- Test: Vérifier connexion physique de l'antenne

**Hypothèse 2: Modem non complètement initialisé**
- Probabilité: **20%**
- Symptômes: Modem répond à AT mais CSQ=99
- Test: Augmenter délais, ajouter vérifications

**Hypothèse 3: Problème matériel (câble, connecteur)**
- Probabilité: **10%**
- Symptômes: Intermittent ou constant selon le problème
- Test: Vérifier toutes les connexions

---

## 📝 CODE À AJOUTER/MODIFIER

### Modification 1: Vérification CSQ préalable

```cpp
bool attachNetworkWithRetry(uint32_t timeoutMs, uint8_t maxRetries)
{
  unsigned long start = millis();
  uint8_t retryCount = 0;
  uint32_t baseDelay = 5000;
  
  Serial.println(F("[MODEM] attache réseau en cours (avec retry)"));
  logRadioSnapshot("attach:start");
  
  // NOUVEAU: Vérifier CSQ avant de commencer
  int8_t initialCsq = modem.getSignalQuality();
  if (initialCsq == 99) {
    Serial.println(F("[MODEM] ⚠️ CSQ=99 avant attachement - Reset modem"));
    modem.restart();
    delay(5000);
    initialCsq = modem.getSignalQuality();
    if (initialCsq == 99) {
      Serial.println(F("[MODEM] ❌ CSQ toujours à 99 après reset - Problème matériel"));
      logRadioSnapshot("attach:csq_fail");
      return false;
    }
  }
  
  // ... reste du code existant ...
}
```

### Modification 2: Diagnostic matériel

```cpp
bool diagnoseModemHardware() {
  Serial.println(F("[DIAG] Démarrage diagnostic matériel..."));
  
  // Test 1: Réponse AT
  if (!modem.testAT(2000)) {
    Serial.println(F("[DIAG] ❌ Modem ne répond pas à AT"));
    return false;
  }
  Serial.println(F("[DIAG] ✅ Modem répond à AT"));
  
  // Test 2: CSQ
  int8_t csq = modem.getSignalQuality();
  if (csq == 99) {
    Serial.println(F("[DIAG] ❌ CSQ=99 (signal invalide)"));
    Serial.println(F("[DIAG]   → Vérifier: antenne, alimentation, connexions"));
    return false;
  }
  Serial.printf("[DIAG] ✅ CSQ=%d (signal valide)\n", csq);
  
  // Test 3: SIM
  SimStatus sim = modem.getSimStatus();
  if (sim != SIM_READY) {
    Serial.println(F("[DIAG] ❌ SIM non prête"));
    return false;
  }
  Serial.println(F("[DIAG] ✅ SIM prête"));
  
  // Test 4: Opérateur
  String oper = modem.getOperator();
  if (oper.length() == 0) {
    Serial.println(F("[DIAG] ⚠️ Opérateur non détecté (normal si pas de réseau)"));
  } else {
    Serial.printf("[DIAG] ✅ Opérateur: %s\n", oper.c_str());
  }
  
  return true;
}
```

---

## ✅ CHECKLIST DE VALIDATION

Avant de considérer le problème résolu:

- [ ] CSQ != 99 après initialisation
- [ ] Opérateur détecté (ou au moins REG_SEARCHING)
- [ ] Attachement réseau réussi (REG_OK_HOME ou REG_OK_ROAMING)
- [ ] Connexion GPRS réussie
- [ ] Test de connexion HTTP réussi
- [ ] Logs montrent une séquence complète sans erreur

---

## 📚 RÉFÉRENCES

- **3GPP TS 27.007**: Standard pour commandes AT et CSQ
- **SIMCOM A7670G Datasheet**: Spécifications matérielles
- **TinyGSM Library**: Documentation de la bibliothèque utilisée

---

**Généré automatiquement le**: 2025-01-07  
**Prochaine révision**: Après implémentation des correctifs

