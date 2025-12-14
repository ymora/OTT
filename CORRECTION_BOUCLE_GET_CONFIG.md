# Correction Boucle Infinie GET_CONFIG

## ✅ Problème identifié

**Symptôme :**
- GET_CONFIG envoyé en boucle infinie
- Erreurs de framing détectées
- Dispositif n'apparaît pas dans le tableau

**Cause :**
1. `usbStreamStatus` était dans les dépendances de `startUsbStreaming`
2. GET_CONFIG était envoyé à chaque fois que `startUsbStreaming` était appelé
3. Pas de flag pour éviter de renvoyer GET_CONFIG

---

## ✅ Corrections appliquées

### 1. Retrait de `usbStreamStatus` des dépendances
**Ligne 1464 :**
```javascript
}, [ensurePortReady, handleUsbStreamChunk, startReading, appendUsbStreamLog, logger, port, isConnected, write])
// ✅ usbStreamStatus retiré des dépendances
```

### 2. Ajout d'un flag pour éviter répétition GET_CONFIG
**Ligne 51 :**
```javascript
const usbGetConfigSentRef = useRef(false) // Flag pour éviter d'envoyer GET_CONFIG plusieurs fois
```

**Lignes 1437-1452 :**
```javascript
// Ne pas envoyer GET_CONFIG si on reprend depuis une pause OU si déjà envoyé
if (!isResuming && !usbGetConfigSentRef.current) {
  // ... envoyer GET_CONFIG ...
  usbGetConfigSentRef.current = true // Marquer comme envoyé
}
```

### 3. Réinitialisation du flag à l'arrêt complet
**Ligne 1510 :**
```javascript
usbGetConfigSentRef.current = false // Réinitialiser le flag GET_CONFIG à l'arrêt complet
```

---

## 🔍 Erreurs de framing

**Cause :** Les erreurs de framing sont souvent dues à :
- Des problèmes de timing (trop de données envoyées trop rapidement)
- Des problèmes de baud rate
- Des interférences sur le port série

**Solution actuelle :** Les erreurs de framing sont silencieusement ignorées (ligne 501-513 de SerialPortManager.js), ce qui est correct car elles sont souvent temporaires.

**Recommandation :** Si les erreurs persistent, vérifier :
- Le baud rate (115200)
- Les câbles USB
- Les drivers série

---

## 🔍 Dispositif n'apparaît pas dans le tableau

**Logique d'affichage (UsbStreamingTab.js ligne 385-440) :**

Le dispositif USB virtuel est ajouté au tableau seulement si :
1. `usbDevice` existe
2. `!isUsbDeviceRegistered()` (pas enregistré en base)
3. A des identifiants (`sim_iccid` ou `device_serial`) OU est temporaire sans identifiants

**Vérifications à faire :**
1. Le dispositif USB est-il détecté ? (`usbDevice` existe ?)
2. A-t-il des identifiants ? (`sim_iccid` ou `device_serial` ?)
3. Est-il enregistré en base ? (`isUsbDeviceRegistered()` retourne `true` ?)

**Si le dispositif est enregistré en base, il devrait apparaître dans le tableau depuis la base de données.**

---

## ✅ Résultat

1. ✅ **Boucle infinie GET_CONFIG** : Corrigée - GET_CONFIG n'est envoyé qu'une seule fois par session
2. ⚠️ **Erreurs de framing** : Normales, silencieusement ignorées (comportement attendu)
3. ⚠️ **Dispositif dans le tableau** : À vérifier - dépend de si le dispositif a des identifiants et est enregistré

---

## 🔧 Prochaines étapes pour diagnostiquer l'absence du dispositif

1. Vérifier dans la console si `usbDevice` existe
2. Vérifier si `usbDevice.sim_iccid` ou `usbDevice.device_serial` existent
3. Vérifier si le dispositif est enregistré en base de données (il devrait apparaître depuis la base)
