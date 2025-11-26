# Architecture USB Streaming

## Structure des fichiers

### 1. `components/SerialPortManager.js` (284 lignes)
**Responsabilité** : Gestion bas niveau du port série
- Connexion/déconnexion au port série
- Lecture/écriture de données brutes
- Gestion des erreurs de port
- **Réutilisable** pour d'autres usages (flash, configuration, etc.)

### 2. `contexts/UsbContext.js` (429 lignes)
**Responsabilité** : Logique métier USB et streaming
- Parsing des données JSON du firmware
- Gestion du streaming continu
- Envoi des mesures à l'API
- Détection automatique des dispositifs
- **Spécifique** au streaming USB

### 3. `components/configuration/UsbStreamingTab.js` (309 lignes)
**Responsabilité** : Interface utilisateur
- Sélection du port USB
- Affichage des logs en temps réel
- Affichage des mesures

## Décision : Garder les fichiers séparés ✅

**Raison** : Séparation des responsabilités (SoC - Separation of Concerns)
- `SerialPortManager` = couche bas niveau (réutilisable)
- `UsbContext` = couche métier (spécifique au streaming)
- `UsbStreamingTab` = couche présentation (UI)

**Avantages** :
- Réutilisabilité : `SerialPortManager` peut être utilisé pour le flash, la configuration, etc.
- Maintenabilité : Chaque fichier a une responsabilité claire
- Testabilité : Plus facile de tester chaque couche séparément

## Commande "usb" au firmware

### Oui, on doit envoyer "usb" au firmware ✅

**Pourquoi ?**
Le firmware ESP32 attend la commande `"usb\n"` dans les **3 secondes après le boot** pour activer le streaming continu.

**Code actuel** (ligne 320 de `contexts/UsbContext.js`) :
```javascript
// Envoyer la commande "usb" au dispositif pour activer le streaming continu
// Le firmware attend cette commande dans les 3 secondes après le boot
const commandSent = await write('usb\n')
```

**Séquence d'activation** :
1. Connexion au port USB (`connect()`)
2. Démarrage de la lecture (`startReading()`)
3. **Envoi de la commande "usb"** (`write('usb\n')`)
4. Le firmware commence à envoyer des données en continu

### Comment ça fonctionnait lors des tests PowerShell ?

Le script `test_com3.ps1` :
- Ouvrait simplement le port COM3
- Lisait les données qui arrivaient
- **N'envoyait PAS la commande "usb"**

**Pourquoi ça marchait quand même ?**
- Le firmware envoie des logs au **boot** (sans commande)
- Mais pour le **streaming continu**, il faut envoyer `"usb\n"`
- Sans cette commande, le streaming s'arrête après quelques secondes

## Problème actuel : La commande "usb" n'est peut-être pas envoyée

**Vérification nécessaire** :
1. Vérifier que `write('usb\n')` est bien appelé après `startReading()`
2. Vérifier que le port est bien connecté avant d'envoyer
3. Ajouter des logs pour confirmer l'envoi

**Ordre actuel dans `startUsbStreaming()`** :
```javascript
1. Vérifier que le port est connecté
2. Arrêter l'ancien streaming
3. Démarrer la lecture (startReading)
4. Envoyer la commande "usb" (write('usb\n'))
```

**Problème potentiel** : Si `startReading()` n'est pas encore prêt, la commande peut être envoyée trop tôt.

## Recommandations

1. **Garder les fichiers séparés** ✅ (bonne architecture)
2. **Vérifier l'envoi de "usb"** : Ajouter des logs et vérifier que la commande est bien envoyée
3. **Améliorer la séquence** : S'assurer que la commande est envoyée après que la lecture soit démarrée

