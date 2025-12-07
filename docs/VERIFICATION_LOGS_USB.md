# Vérification des Logs USB - Firmware vs Dashboard

**Date :** 2024-12-19  
**Problème :** Les logs détaillés OTA du firmware ne sont pas visibles, seulement les messages génériques du dashboard.

---

## 📋 Analyse du Firmware

### ✅ Logs envoyés par le firmware en mode USB

Le firmware envoie bien TOUS ses logs via `Serial.println/printf`. Voici les logs qui DEVRAIENT être visibles :

#### 1. **Logs de démarrage (une seule fois)**
- `[USB] 🚀 Processus 1 démarré - Affichage mesures toutes les secondes`
- `[USB] 📡 État modem: ✅ Prêt / ❌ Non initialisé`
- `[USB] 📡 Réseau: ✅ Connecté | GPRS: ✅ Connecté` (si modem prêt)

#### 2. **Logs réseau périodiques (toutes les 10 secondes)**
- `[USB] 📶 Réseau: ✅ Connecté | GPRS: ✅ Connecté | RSSI: XX dBm (CSQ=XX)`

#### 3. **Logs GPS (quand disponible)**
- `[USB] 📍 GPS: XX.XXXX,XX.XXXX`

#### 4. **Logs OTA (quand une mesure est envoyée, toutes les 24h par défaut)**
- `[OTA] 📤 Envoi mesure périodique (processus normal)...`
- `[OTA] 📶 RSSI: XX dBm (CSQ=XX)`
- `[OTA] 📍 Acquisition GPS en cours...`
- `[OTA] 📍 GPS: XX.XXXXXX, XX.XXXXXX` ou `[OTA] ⚠️ GPS non disponible`
- `[OTA] 📤 Envoi à la base de données...`
- `[API] 📤 ICCID: ... | Serial: ... | FW: ...`
- `[API] ℹ️ Authentification par ICCID`
- `[API] 📤 URL: https://...`
- `[API] 📦 Taille payload: XXX octets`
- `[API] ✅ Mesure reçue par la base de données avec succès` ou `[API] ❌ Échec envoi mesure`
- `[API] Réponse base de données: {...}`
- `[API] 📊 Données enregistrées: Débit=XX.XX L/min | Batterie=XX% | RSSI=XX dBm`
- `[OTA] ✅ Mesure envoyée à la base de données avec succès (débit: XX.XX L/min, batterie: XX%, RSSI: XX dBm)`
- `[OTA] ⏰ Prochaine mesure dans XX minutes`

#### 5. **Logs de commandes OTA (quand reçues)**
- `[CMD] 📥 Commande reçue: XXX (ID: XX)`
- `[CMD] ✅ SET_SLEEP_SECONDS: XX minutes`
- `[CMD] 📤 Envoi ACK: ID=XX | Status=executed | Message=...`
- `[CMD] ✅ ACK envoyé avec succès à l'API`

#### 6. **Logs modem (quand initialisé)**
- `[MODEM] Initialisation modem pour processus OTA normal (mode USB)...`
- `[MODEM] ✅ Modem initialisé - Processus OTA activé`
- `[MODEM] ⚠️ Échec initialisation modem (réessai dans 30s)`
- `[MODEM] ✅ Réseau reconnecté - Processus OTA activé`

---

## 🔍 Analyse du Dashboard

### Comment les logs sont capturés

1. **`handleUsbStreamChunk`** (ligne 1041) : Reçoit les chunks du port série
2. **`processUsbStreamLine`** (ligne 388) : Traite chaque ligne et appelle `appendUsbStreamLog(trimmed)`
3. **`appendUsbStreamLog`** (ligne 73) : Ajoute les logs à `usbStreamLogs` (état React) et à `logsToSendRef.current` (pour envoi au serveur)

### Problèmes identifiés

#### ✅ **Tous les logs DEVRAIENT être affichés**
Le code montre que `processUsbStreamLine` appelle `appendUsbStreamLog` pour **TOUTES** les lignes reçues (ligne 402).

#### ⚠️ **Limite d'affichage : 80 lignes**
`usbStreamLogs` est limité à 80 lignes (`next.slice(-80)`, ligne 81). Si beaucoup de logs arrivent rapidement, les anciens sont perdus.

#### ⚠️ **Messages génériques du dashboard**
Le message `📤 X log(s) envoyé(s) à la base de données` est ajouté **APRÈS** l'envoi au serveur (ligne 229), ce qui peut masquer les logs du firmware.

---

## 🐛 Problème Probable

**Les logs du firmware arrivent bien, mais :**

1. **Ils sont noyés par les messages génériques** : Le dashboard ajoute des messages toutes les 5 secondes ("📤 X log(s) envoyé(s)"), ce qui peut masquer les logs du firmware.

2. **Limite de 80 lignes** : Si beaucoup de logs arrivent (mesures USB toutes les secondes + logs OTA), les logs OTA peuvent être perdus car ils arrivent moins fréquemment.

3. **Timing** : Les logs OTA n'apparaissent que toutes les 24 heures (par défaut), donc si l'utilisateur n'attend pas assez longtemps, il ne les voit pas.

---

## ✅ Solutions Recommandées

### Solution 1 : Augmenter la limite d'affichage
**Fichier :** `contexts/UsbContext.js` ligne 81
```javascript
// Changer de 80 à 500 lignes
return next.slice(-500)
```

### Solution 2 : Filtrer les messages génériques du dashboard
**Fichier :** `contexts/UsbContext.js` ligne 229
Ne pas ajouter le message "📤 X log(s) envoyé(s)" si les logs sont envoyés automatiquement, ou le rendre moins visible.

### Solution 3 : Ajouter un indicateur visuel
Ajouter un badge ou une section séparée pour les logs OTA vs USB dans l'interface.

### Solution 4 : Vérifier que les logs arrivent bien
Ajouter un log de debug dans `processUsbStreamLine` pour confirmer que tous les logs sont bien reçus.

---

## 🧪 Test à Faire

1. **Connecter le dispositif en USB**
2. **Attendre le démarrage** : Vérifier si les logs de démarrage apparaissent
3. **Attendre 10 secondes** : Vérifier si les logs réseau apparaissent
4. **Configurer un sleep court (ex: 3 minutes)** : Vérifier si les logs OTA apparaissent après l'envoi
5. **Vérifier la console du navigateur** : Regarder les logs `logger.debug` pour voir si les logs arrivent mais ne sont pas affichés

---

## 📝 Conclusion

Le firmware envoie bien tous les logs détaillés. Le problème est probablement dans l'affichage ou la capture côté dashboard. Les solutions proposées devraient résoudre le problème.

