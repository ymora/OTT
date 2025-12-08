# 🔍 Analyse des Logs - Problèmes Identifiés

## 📋 Résumé des Problèmes

### 1. ⚠️ **Watchdog Timeout (CRITIQUE)**

**Symptômes** :
```
E (122404) task_wdt: Task watchdog got triggered
E (218593) task_wdt: Task watchdog got triggered
Rebooting...
```

**Analyse** :
- Le watchdog est configuré à **30 secondes** (`[WDT] armé (30s)`)
- Mais il se déclenche après **~122 secondes** puis **~218 secondes**
- Cela indique que le watchdog n'est **pas réinitialisé correctement** dans certaines tâches
- Le système redémarre en boucle à cause de ce timeout

**Cause probable** :
- Une tâche (probablement `loopTask` sur CPU 1) bloque trop longtemps
- Le watchdog n'est pas réinitialisé (`esp_task_wdt_reset()`) dans les boucles longues
- Opérations bloquantes (attente modem, delay() trop longs, etc.)

**Impact** : 🔴 **CRITIQUE** - Le système redémarre en boucle

---

### 2. 📡 **Échec d'Attachement au Réseau Modem**

**Symptômes** :
```
[MODEM][attach:retry] CSQ=99 (RSSI=25 dBm) reg=-1 (indéfini) oper=<n/a> eps=KO gprs=KO
[MODEM] attente réseau... (tentative 1/3)
[MODEM] attente réseau... (tentative 2/3)
[MODEM] attente réseau... (tentative 3/3)
[MODEM] ⚠️ Échec initialisation modem (réessai dans 30s)
```

**Analyse** :
- **CSQ=99** : Valeur **invalide** (normalement entre 0-31)
  - 0-31 = Signal valide
  - 99 = Erreur/Non disponible
- **reg=-1** : Pas de réseau enregistré
- **oper=<n/a>** : Opérateur non détecté
- **eps=KO gprs=KO** : Échec d'attachement au réseau (ni 4G ni 2G)

**Causes possibles** :
1. **SIM invalide ou non activée**
2. **Pas de couverture réseau** à l'emplacement
3. **APN incorrect** (configuré "free" mais peut-être pas le bon)
4. **Modem non initialisé correctement**
5. **Antenne déconnectée ou défectueuse**

**Impact** : 🟠 **ÉLEVÉ** - Les mesures OTA ne peuvent pas être envoyées

---

### 3. 🔄 **Reboot en Boucle**

**Symptômes** :
```
Rebooting...
entry 0x400805b4
load:0x40080400,len:3500
...
═══ OTT Firmware v1.0 ═══
```

**Analyse** :
- Le système redémarre après chaque watchdog timeout
- Le cycle se répète indéfiniment
- Le modem tente de s'initialiser à chaque boot mais échoue

**Impact** : 🔴 **CRITIQUE** - Le dispositif ne peut pas fonctionner normalement

---

### 4. 📊 **Mesures OTA Bloquées**

**Symptômes** :
```
[OTA] ⚠️ Modem non prêt - Mesure OTA reportée
[MODEM] ⚠️ Les mesures OTA ne seront pas envoyées tant que le modem n'est pas connecté
```

**Analyse** :
- Les mesures sont prises correctement (USB streaming fonctionne)
- Mais elles ne sont **pas envoyées en OTA** car le modem n'est pas prêt
- Le streaming USB fonctionne, donc le problème est uniquement réseau

**Impact** : 🟡 **MOYEN** - Les mesures sont visibles en USB mais pas en OTA

---

## 🎯 Solutions Recommandées

### Solution 1 : Corriger le Watchdog

**Actions** :
1. **Réinitialiser le watchdog** dans toutes les boucles longues :
   ```cpp
   void loop() {
     esp_task_wdt_reset(); // Réinitialiser le watchdog
     // ... code ...
   }
   ```

2. **Éviter les `delay()` trop longs** :
   - Remplacer `delay(5000)` par des boucles avec `delay(100)` et `esp_task_wdt_reset()`

3. **Vérifier les tâches bloquantes** :
   - Identifier la tâche `loopTask` qui bloque
   - S'assurer qu'elle réinitialise le watchdog régulièrement

### Solution 2 : Diagnostiquer le Modem

**Actions** :
1. **Vérifier la SIM** :
   - SIM activée ?
   - Crédit disponible ?
   - APN correct pour l'opérateur ?

2. **Vérifier la couverture réseau** :
   - Tester à un autre emplacement
   - Vérifier l'antenne

3. **Améliorer les logs** :
   - Logger les commandes AT envoyées au modem
   - Logger les réponses complètes du modem
   - Logger l'état du modem avant chaque tentative

4. **Gestion d'erreur CSQ=99** :
   - Détecter CSQ=99 comme erreur
   - Ne pas utiliser RSSI=25 dBm si CSQ=99 (c'est invalide)
   - Logger "Signal invalide" au lieu de "RSSI=25 dBm"

### Solution 3 : Mode Dégradé

**Actions** :
1. **Continuer le streaming USB** même si modem échoue
2. **Stocker les mesures localement** (si mémoire disponible)
3. **Réessayer l'envoi OTA** périodiquement sans bloquer

---

## 📊 Priorités

1. 🔴 **URGENT** : Corriger le watchdog timeout (cause les reboots)
2. 🟠 **IMPORTANT** : Diagnostiquer le modem (bloque l'envoi OTA)
3. 🟡 **MOYEN** : Améliorer la gestion d'erreur et les logs

---

## 🔧 Commandes de Diagnostic

Pour diagnostiquer le modem, vérifier :
1. **État de la SIM** : `AT+CPIN?`
2. **Opérateur** : `AT+COPS?`
3. **Signal** : `AT+CSQ`
4. **Réseau** : `AT+CREG?` et `AT+CGREG?`
5. **APN** : `AT+CGDCONT?`

## 🐛 Bugs Identifiés dans le Code

### Bug 1 : Affichage incorrect de RSSI quand CSQ=99

**Fichier** : `hardware/firmware/fw_ott_optimized/fw_ott_optimized.ino`
**Ligne** : ~1251

**Problème** :
```cpp
int8_t csq = modem.getSignalQuality();
int16_t rssi_dbm = csqToRssi(csq);
Serial.printf("[MODEM][%s] CSQ=%d (RSSI=%d dBm) ...", stage, csq, rssi_dbm);
```

Quand `csq = 99` (erreur), `csqToRssi(99)` retourne `-999`, mais le log affiche quand même "RSSI=25 dBm" ce qui est **incorrect**.

**Solution** : Vérifier CSQ avant d'afficher RSSI :
```cpp
if (csq == 99) {
  Serial.printf("[MODEM][%s] CSQ=99 (Signal invalide) ...", stage);
} else {
  Serial.printf("[MODEM][%s] CSQ=%d (RSSI=%d dBm) ...", stage, csq, rssi_dbm);
}
```

### Bug 2 : Watchdog non réinitialisé dans certaines boucles

**Problème** : Le watchdog se déclenche après ~122s puis ~218s, ce qui suggère que certaines boucles longues ne réinitialisent pas le watchdog.

**Zones à vérifier** :
- Boucles d'attente du modem (`attachNetworkWithRetry`)
- Boucles de streaming USB
- Boucles de mesure de capteur

**Solution** : S'assurer que `feedWatchdog()` est appelé dans toutes les boucles longues.

---

## 📝 Notes

- Le **streaming USB fonctionne** correctement
- Les **mesures sont prises** correctement
- Le problème principal est le **modem qui ne s'attache pas au réseau**
- Le **watchdog timeout** aggrave le problème en causant des reboots

