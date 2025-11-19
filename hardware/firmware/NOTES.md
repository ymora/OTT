# Notes Firmware OTT V3

## Endpoints consommés
- POST /api.php/devices/measurements
- GET /api.php/devices/commands/pending?iccid=...
- POST /api.php/devices/commands/ack
- POST /api.php/devices/logs

## Commandes supportées
- SET_SLEEP_SECONDS : payload `{ "value": <seconds> }` → ajuste le prochain deep sleep (min 1 min).
- PING : répond `pong` et laisse le cycle normal.
- UPDATE_CONFIG : payload JSON (apn/jwt/iccid/serial/sim_pin). Les valeurs sont enregistrées en NVS puis appliquées après redémarrage.
- UPDATE_CALIBRATION : payload `{ "a0": ..., "a1": ..., "a2": ... }` → met à jour les coefficients capteur (persistés en NVS).

## TODO (roadmap)
- Gérer OTA_REQUEST (téléchargement binaire + checksum).
- Supporter des profils multiples (APN, seuils patients).
- Ajouter d'autres niveaux de logs (ex: `ERROR` détaillés modem).

