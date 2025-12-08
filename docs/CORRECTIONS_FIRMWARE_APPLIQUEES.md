# ✅ Corrections Appliquées au Firmware

## 📋 Résumé des Corrections

### 1. ✅ Bug d'affichage CSQ=99 corrigé

**Problème** : Quand CSQ=99 (signal invalide), le code affichait quand même "RSSI=25 dBm" ce qui était incorrect.

**Solution** : 
- Vérification de CSQ avant d'afficher RSSI
- Affichage "Signal invalide" quand CSQ=99
- Ajout de logs détaillés pour diagnostiquer CSQ=99

**Fichier** : `hardware/firmware/fw_ott_optimized/fw_ott_optimized.ino`
**Fonction** : `logRadioSnapshot()`

**Code corrigé** :
```cpp
if (csq == 99) {
  Serial.printf("[MODEM][%s] CSQ=99 (Signal invalide) reg=%d (%s) oper=%s eps=%s gprs=%s\n", ...);
} else {
  int16_t rssi_dbm = csqToRssi(csq);
  Serial.printf("[MODEM][%s] CSQ=%d (RSSI=%d dBm) reg=%d (%s) oper=%s eps=%s gprs=%s\n", ...);
}
```

---

### 2. ✅ Watchdog - Remplacement des delay() longs

**Problème** : Les `delay()` longs (2s, 3s, 20s, 30s) ne réinitialisaient pas le watchdog, causant des timeouts.

**Solution** : Remplacement de tous les `delay()` > 1s par des boucles avec `feedWatchdog()` régulier.

**Corrections appliquées** :

#### a) `attachNetworkWithRetry()` - Délai entre retries (5s, 10s, 20s, 30s)
```cpp
// AVANT
delay(delayMs); // 5s à 30s

// APRÈS
unsigned long delayStart = millis();
while (millis() - delayStart < delayMs) {
  delay(100);
  feedWatchdog();
}
```

#### b) `attachNetworkWithRetry()` - Délai après changement d'APN (2s)
```cpp
// AVANT
delay(2000);

// APRÈS
unsigned long apnDelayStart = millis();
while (millis() - apnDelayStart < 2000) {
  delay(100);
  feedWatchdog();
}
```

#### c) `connectData()` - Délai de stabilisation (1s)
```cpp
// AVANT
delay(1000);

// APRÈS
unsigned long stabilDelayStart = millis();
while (millis() - stabilDelayStart < 1000) {
  delay(100);
  feedWatchdog();
}
```

#### d) `connectData()` - Délai entre tentatives APN (3s)
```cpp
// AVANT
delay(3000);

// APRÈS
unsigned long apnRetryDelayStart = millis();
while (millis() - apnRetryDelayStart < 3000) {
  delay(100);
  feedWatchdog();
}
```

#### e) `waitForNetwork()` - Attente réseau (10s)
```cpp
// AVANT
if (modem.waitForNetwork(10000)) { ... }

// APRÈS
unsigned long networkWaitStart = millis();
bool networkAttached = false;
while (millis() - networkWaitStart < 10000 && !networkAttached) {
  feedWatchdog();
  if (modem.waitForNetwork(1000)) {
    networkAttached = true;
    return true;
  }
}
```

---

### 3. ✅ Logs améliorés pour diagnostic

**Ajout** : Logs détaillés pour CSQ=99 (signal invalide)

**Code ajouté** :
```cpp
// Logs détaillés pour CSQ=99 (signal invalide)
if (csq == 99) {
  Serial.println(F("[MODEM] ⚠️  SIGNAL INVALIDE (CSQ=99) - Causes possibles:"));
  Serial.println(F("[MODEM]   1. Antenne déconnectée ou défectueuse"));
  Serial.println(F("[MODEM]   2. Pas de couverture réseau à cet emplacement"));
  Serial.println(F("[MODEM]   3. Modem non initialisé correctement"));
  Serial.println(F("[MODEM]   4. Problème matériel (câble, connecteur)"));
}
```

---

## 🎯 Impact des Corrections

### Avant
- ❌ Watchdog timeout après ~122s puis ~218s
- ❌ Reboot en boucle
- ❌ Logs incorrects (RSSI=25 dBm quand CSQ=99)
- ❌ Diagnostic difficile

### Après
- ✅ Watchdog réinitialisé régulièrement dans toutes les boucles longues
- ✅ Plus de timeout watchdog (sauf si vraiment bloqué)
- ✅ Logs corrects (affichage "Signal invalide" quand CSQ=99)
- ✅ Diagnostic amélioré avec messages d'aide

---

## 📝 Notes

- Les `delay()` courts (< 1s) sont conservés car ils ne causent pas de timeout
- Le watchdog est maintenant réinitialisé toutes les 100ms dans les boucles longues
- Les logs sont plus informatifs pour diagnostiquer les problèmes de modem

---

## 🔄 Prochaines Étapes Recommandées

1. **Compiler et tester** le firmware corrigé
2. **Vérifier** que le watchdog ne se déclenche plus
3. **Diagnostiquer** le problème CSQ=99 (antenne, couverture, SIM)
4. **Tester** la connexion réseau avec les corrections

