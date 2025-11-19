# fw_ott_optimized (reconstruction)

Ce dossier contient la base nécessaire pour reconstruire le firmware OTT V3 après la perte des sources.

## Contenu

- w_ott_optimized.ino : squelette principal basé sur la documentation (mesure ? POST HTTPS ? deep sleep).
- legacy/fw_ott.ino : point d'entrée historique (setup unique, appels vers modem + capteurs).
- legacy/lte_modem.ino : stub TinyGSM / SIM7600 (connexion + push mesures + commandes descendantes).
- legacy/sensor.ino : lecture MPXV7007DP + batterie avec calibration simplifiée.

## Étapes pour remettre le firmware en service

1. Compléter les stubs :
   - Configurer TinyGSM (Serial2, pins PWRKEY, DTR, etc.).
   - Ajouter l'authentification (JWT ou clé device) dans sendMeasurement().
   - Remplacer la calibration par les coefficients réels.
2. Tester sur ESP32 (DevKitC) :
   `ash
   arduino-cli compile --fqbn esp32:esp32:esp32 fw_ott_optimized.ino
   arduino-cli upload -p COM3 --fqbn esp32:esp32:esp32 fw_ott_optimized.ino
   `
3. Vérifier côté backend Render :
   - curl https://ott-jbln.onrender.com/api.php/devices/measurements
   - Dashboard Commandes ? planifier un SET_SLEEP_SECONDS et vérifier le retour via modemCheckCommands().
4. Taguer la release :
   `ash
   git tag firmware-v3.0-rebuild
   git push origin firmware-v3.0-rebuild
   `

## Remarque
Ces fichiers sont volontairement minimalistes : ils documentent la logique décrite dans public/DOCUMENTATION_COMPLETE_OTT.html et doivent être enrichis avant toute mise en production.
