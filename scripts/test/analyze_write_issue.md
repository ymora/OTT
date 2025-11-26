# Analyse du problème d'envoi de la commande "usb"

## Problème observé
```
⚠️ Échec de l'envoi de la commande "usb" - Le streaming continu ne démarrera pas
```

## Flux du code actuel

### 1. `connect()` dans SerialPortManager.js
- Ligne 118: `await portToUse.open({ baudRate })`
- Ligne 121: `const writer = portToUse.writable.getWriter()`
- Ligne 122: `writerRef.current = writer`
- Ligne 128: `setIsConnected(true)`

**Problème potentiel**: `setIsConnected(true)` est asynchrone (React state), mais `writerRef.current` est synchrone.

### 2. `startUsbStreaming()` dans UsbContext.js
- Ligne 331: Attente 200ms (maintenant 500ms)
- Ligne 335: `const commandSent = await write('usb\n')`

### 3. `write()` dans SerialPortManager.js
- Ligne 274: `if (!writerRef.current)` - Vérifie si writerRef existe
- Si null, essaie de créer un nouveau writer (ligne 284)

## Problème identifié

**Hypothèse 1**: `writerRef.current` est bien défini après `connect()`, mais `write()` est appelé depuis `UsbContext` qui utilise `write` du contexte, et peut-être que la référence n'est pas la même.

**Hypothèse 2**: Le port est ouvert, mais `port.writable` n'est pas encore disponible immédiatement après `open()`.

**Hypothèse 3**: Le writer créé dans `connect()` est libéré ou réinitialisé quelque part.

## Solution à tester

1. Vérifier que `writerRef.current` existe avant d'appeler `write()`
2. Ajouter des logs pour voir l'état exact de `writerRef.current` et `port.writable`
3. Peut-être attendre plus longtemps ou vérifier différemment

## Test à faire

Créer un script qui simule exactement:
1. Ouvrir le port
2. Créer le writer
3. Attendre 500ms
4. Vérifier que writerRef existe
5. Envoyer "usb\n"

