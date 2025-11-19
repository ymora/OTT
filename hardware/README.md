# OTT Hardware & Firmware

Ce dépôt privé contient les artefacts matériels sensibles :

- `firmware/` : code ESP32/SIM7600 (`fw_ott_optimized`) + dossiers legacy reconstitués.
- `cad/` : plans 3D, documents techniques et BOM.

## Organisation

| Dossier | Description | Notes |
|---------|-------------|-------|
| `firmware/fw_ott_optimized/` | Firmware principal (nouveau squelette + instructions). | Compiler via `arduino-cli`, publier seulement les binaires signés dans l’API. |
| `firmware/fw_ott_optimized/legacy/` | Version historique séparée en 3 fichiers (`fw_ott`, `lte_modem`, `sensor`). | Sert de référence si retour arrière nécessaire. |
| `cad/Impression3D/` | Pièces STL + PDF. | Partager uniquement les versions validées. |
| `docs/` | Documentation modem (ex: <code>SIM7600_AT.pdf</code>). | Lecture uniquement, ne pas modifier le PDF original. |

## Mode streaming USB (nouveau)

1. Brancher le boîtier OTT en USB puis ouvrir un moniteur série 115200 bauds.
2. Dès la bannière `[BOOT]`, taper `usb` + Entrée (fenêtre ~3 secondes).
3. Le firmware reste éveillé et envoie 1 mesure/s au format JSON + texte.

Commandes disponibles :

- `once` — envoie immédiatement une mesure
- `interval=<ms>` — 200 à 10 000 ms (défaut 1 000 ms)
- `help` — récapitulatif des commandes
- `exit` / `usb_stream_off` — quitte le streaming, redémarre et reprend le cycle 4G/deep sleep

📌 Le code correspondant se trouve dans `firmware/fw_ott_optimized/fw_ott_optimized.ino` (`detectUsbStreamingMode()` + `usbStreamingLoop()`).

## Reconstruction du firmware

Cette copie a été recréée à partir de la documentation OTT V3. Pour repartir :

1. Ouvrir `firmware/fw_ott_optimized/fw_ott_optimized.ino` et compléter les stubs (TinyGSM, calibration, authentification).
2. Adapter les fichiers `legacy/*.ino` si vous préférez l’architecture 2.x.
3. Compiler / flasher :
   ```powershell
   # compilation seule
   .\scripts\build_firmware.ps1 -Fqbn esp32:esp32:esp32
   # compilation + upload
   .\scripts\build_firmware.ps1 -Fqbn esp32:esp32:esp32 -Port COM5 -Upload
   ```
4. Vérifier côté Render (`curl https://ott-jbln.onrender.com/...`) puis taguer la release (`git tag firmware-v3.0-rebuild`).
5. Pour reconfigurer un boîtier en production :
   - `UPDATE_CONFIG` → secrets (APN/JWT/ICCID/serial/PIN SIM) stockés en NVS (redémarrage auto).
   - `UPDATE_CALIBRATION` → nouveaux coefficients capteur (`a0/a1/a2`) persistés.

## Bonnes pratiques

1. Garder ce dépôt **privé** et limiter les accès.
2. Taguer chaque firmware poussé en production (permet la traçabilité OTA).
3. Chiffrer les archives partagées en dehors du périmètre interne (7zip AES).
4. Dans le dépôt public OTT, publier uniquement les binaires (`firmwares/*.bin`) nécessaires.

---

© HAPPLYZ MEDICAL SAS
