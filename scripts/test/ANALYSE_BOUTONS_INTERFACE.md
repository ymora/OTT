# Analyse des boutons de l'interface et correspondance firmware

## Boutons identifiés dans l'interface

### Section 1 : État de connexion
1. **Connexion USB** (🔌)
   - Action : Connecte/déconnecte le port USB
   - Commande firmware : Aucune (gestion côté dashboard)
   - ✅ OK

2. **Streaming** (▶️/⏸️)
   - Action : Démarre/pause le streaming
   - Commande firmware : `start` / `stop` / `pause`
   - ✅ OK

### Section 2 : Système
3. **Identifiant** (🆔)
   - Action : Demande les infos du dispositif
   - Commande firmware : `device_info`
   - ✅ OK

4. **Firmware** (💾)
   - Action : Demande les infos du dispositif (redondant avec Identifiant)
   - Commande firmware : `device_info`
   - ⚠️ Redondant - Utilise la même commande que Identifiant

5. **Modem** (📡)
   - Action : Démarre/arrête le modem
   - Commande firmware : `modem_on` / `modem_off`
   - ✅ OK

6. **GPS** (📍)
   - Action : Teste le GPS
   - Commande firmware : `gps`
   - ⚠️ Problème : Le firmware teste le GPS mais n'envoie pas de mesure avec la position dans la réponse JSON
   - Suggestion : Le firmware devrait aussi envoyer une mesure avec la position GPS après le test

### Section 3 : Mesures
7. **Débit** (💨)
   - Action : Demande le débit uniquement
   - Commande firmware : `flowrate`
   - ✅ OK (mais pourrait inclure RSSI si modem démarré)

8. **Batterie** (🔋)
   - Action : Demande la batterie uniquement
   - Commande firmware : `battery`
   - ✅ OK (mais pourrait inclure RSSI si modem démarré)

9. **RSSI** (📶)
   - Action : Teste le réseau et obtient le RSSI
   - Commande firmware : `test_network` (si modem running) ou `modem_on` (si modem stopped)
   - ⚠️ Problème : `test_network` ne renvoie pas de mesure JSON avec le RSSI, seulement des logs
   - Suggestion : Le firmware devrait aussi envoyer une mesure avec le RSSI après le test

## Problèmes identifiés

### 1. Commandes qui ne renvoient pas de mesures JSON
- `test_network` : Ne renvoie que des logs, pas de mesure JSON avec RSSI
- `gps` : Ne renvoie que des logs, pas de mesure JSON avec position GPS

### 2. Commandes qui pourraient être améliorées
- `flowrate` : Pourrait inclure RSSI si modem démarré
- `battery` : Pourrait inclure RSSI si modem démarré

### 3. Commandes manquantes dans l'interface
- `once` : Mesure complète (débit + batterie + RSSI + GPS) - Non accessible depuis l'interface

### 4. Redondance
- Firmware et Identifiant utilisent la même commande `device_info`

## Corrections à apporter

### Firmware
1. `test_network` devrait aussi envoyer une mesure JSON avec le RSSI après le test
2. `gps` devrait aussi envoyer une mesure JSON avec la position GPS après le test
3. `flowrate` et `battery` pourraient inclure RSSI si modem démarré

### Interface
1. Ajouter un bouton pour `once` (mesure complète)
2. Améliorer le feedback visuel après les commandes `test_network` et `gps`
3. S'assurer que les réponses JSON sont bien affichées dans l'interface

