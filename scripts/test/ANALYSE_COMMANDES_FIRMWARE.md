# Analyse des commandes firmware - Problèmes identifiés

## Problème principal identifié

### 1. Fenêtre de détection USB trop courte
- **Problème** : Le firmware attend la commande "usb" dans les **3.5 secondes** après le boot (`USB_HANDSHAKE_WINDOW_MS = 3500`)
- **Impact** : Si on se connecte après que le dispositif soit déjà allumé, le firmware ne rentre pas en mode USB streaming
- **Solution** : Le firmware devrait aussi accepter "usb" en mode normal, pas seulement dans la fenêtre de 3.5 secondes

### 2. Timing de l'envoi des commandes
- **Actuel** : 
  - Délai de 500ms après connexion avant envoi "usb"
  - Délai de 500ms après "usb" avant envoi "start"
  - Délai de 200ms après "start"
- **Problème** : Si le dispositif est déjà allumé, la fenêtre de 3.5 secondes est déjà passée
- **Solution** : Le firmware devrait accepter "usb" à tout moment, pas seulement au boot

### 3. Vérification du writer
- **Actuel** : Le dashboard vérifie que `port.writable` existe avant d'envoyer
- **Problème** : Le writer pourrait ne pas être créé même si `port.writable` existe
- **Solution** : Vérifier que `writerRef.current` existe, sinon le créer

### 4. Format des commandes
- **Actuel** : Les commandes sont envoyées avec `command + '\n'`
- **OK** : Le format est correct, le firmware lit jusqu'à '\n'

### 5. Sérialisation des commandes
- **Actuel** : Un flag `sendingCommand` empêche les chevauchements
- **OK** : La sérialisation est correcte

## Corrections à apporter

### 1. Firmware : Accepter "usb" à tout moment
Le firmware devrait accepter la commande "usb" même après la fenêtre de 3.5 secondes, en vérifiant périodiquement dans `usbStreamingLoop()`.

### 2. Dashboard : Vérifier que le writer existe
Avant d'envoyer des commandes, vérifier que `writerRef.current` existe, sinon le créer.

### 3. Dashboard : Envoyer "usb" immédiatement après connexion
Réduire le délai initial à 200ms au lieu de 500ms pour envoyer "usb" plus rapidement.

### 4. Firmware : Logs plus détaillés
Ajouter plus de logs dans le firmware pour voir ce qui est reçu et traité.

## Tests à effectuer

1. Connecter le dispositif alors qu'il est déjà allumé
2. Vérifier que "usb" est bien reçu et traité
3. Vérifier que "start" active bien le streaming
4. Tester toutes les commandes (modem_on, test_network, gps, flowrate, battery, etc.)

