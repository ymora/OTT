# 🔄 Système OTA et Gestion de Version

## Vue d'ensemble

Le firmware a été amélioré pour supporter :
- ✅ **Extraction automatique de version** depuis le binaire compilé
- ✅ **Validation de version** après OTA
- ✅ **Mécanisme de rollback** en cas d'échec
- ✅ **Sauvegarde de la version précédente** pour restauration
- ✅ **Détection d'échecs de boot** et rollback automatique

## 📦 Compilation et Upload

### Compilation

Le firmware doit être compilé localement avec Arduino IDE ou PlatformIO :

```bash
# Avec Arduino CLI
arduino-cli compile --fqbn esp32:esp32:esp32 fw_ott_optimized.ino

# Le fichier .bin sera généré dans build/esp32.esp32.esp32/
```

### Extraction de la Version

Pour extraire la version depuis le fichier `.bin` compilé :

```bash
python extract_version.py firmware.bin
# Affiche: 3.0-rebuild

# En JSON (pour intégration dashboard)
python extract_version.py firmware.bin --json
# Affiche: {"version": "3.0-rebuild"}
```

Le script recherche la section `.version` dans le binaire qui contient `OTT_FW_VERSION=<version>`.

## 🔄 Processus OTA

### 1. Préparation du Firmware

1. **Compiler le firmware** avec la version souhaitée (modifier `FIRMWARE_VERSION_STR` dans le code)
2. **Extraire la version** depuis le `.bin` :
   ```bash
   python extract_version.py build/esp32.esp32.esp32/fw_ott_optimized.bin
   ```
3. **Calculer le MD5** du fichier `.bin` :
   ```bash
   # Windows
   certutil -hashfile firmware.bin MD5
   
   # Linux/Mac
   md5sum firmware.bin
   ```
4. **Uploader le `.bin`** sur un serveur accessible en HTTPS (S3, Render, etc.)

### 2. Envoi de la Commande OTA

Le dashboard envoie une commande `OTA_REQUEST` avec :

```json
{
  "command": "OTA_REQUEST",
  "payload": {
    "url": "https://example.com/firmware/fw_ott_optimized_v3.1.bin",
    "md5": "a1b2c3d4e5f6...",
    "version": "3.1"
  }
}
```

### 3. Processus sur le Device

1. **Réception de la commande** : Le device reçoit `OTA_REQUEST`
2. **Sauvegarde de l'état** :
   - Version actuelle → `previousFirmwareVersion`
   - Flag `otaInProgress = true`
3. **Téléchargement** : Le firmware télécharge le `.bin` depuis l'URL
4. **Vérification MD5** : Validation de l'intégrité
5. **Flash** : Écriture dans la partition OTA
6. **Reboot** : Redémarrage sur la nouvelle version

### 4. Validation au Boot

Au prochain boot :

1. **Détection OTA** : Si `otaInProgress == true`, validation en cours
2. **Vérification version** : Compare `FIRMWARE_VERSION` avec la version attendue
3. **Marquage stable** : Si le boot réussit, `otaInProgress = false` et version sauvegardée
4. **Rollback** : Si 3 échecs de boot consécutifs, tentative de rollback

## 🛡️ Sécurité et Rollback

### Protection contre les Échecs

- **Compteur d'échecs** : `bootFailureCount` incrémenté si problème détecté
- **Seuil de rollback** : Après 3 échecs, rollback automatique
- **Sauvegarde version précédente** : Toujours disponible pour restauration

### Limitations Actuelles

⚠️ **Note importante** : Le rollback automatique complet nécessite :
- Configuration ESP32 avec **dual OTA partitions** (app0 et app1)
- Utilisation de `Update.swap()` pour basculer entre partitions
- Configuration du bootloader pour gérer les partitions

Actuellement, le firmware :
- ✅ Détecte les échecs
- ✅ Log les événements de rollback
- ⚠️ Nécessite un reflash manuel pour un vrai rollback (ou configuration dual partition)

### Amélioration Future : Dual Partition OTA

Pour un rollback automatique complet, configurer les partitions :

```
# partitions.csv
# Name,   Type, SubType, Offset,  Size, Flags
nvs,      data, nvs,     0x9000,  0x4000,
otadata,  data, ota,     0xd000,  0x2000,
app0,     app,  ota_0,   0x10000, 0x200000,
app1,     app,  ota_1,   0x210000,0x200000,
```

Puis utiliser `Update.swap()` après un OTA réussi.

## 📊 Stockage NVS

Les informations suivantes sont stockées en NVS :

| Clé | Type | Description |
|-----|------|-------------|
| `fw_version` | String | Version actuelle du firmware |
| `fw_version_prev` | String | Version précédente (pour rollback) |
| `ota_in_progress` | Bool | Flag indiquant qu'une OTA est en cours |
| `boot_failures` | UChar | Compteur d'échecs de boot |
| `ota_url` | String | URL primaire pour OTA |
| `ota_fallback` | String | URL de fallback pour OTA |
| `ota_md5` | String | MD5 attendu pour validation |

## 🔍 Debugging

### Logs Série

Le firmware affiche des logs détaillés :

```
[BOOT] ========================================
[BOOT] Firmware version: 3.0-rebuild
[BOOT] ========================================

[BOOT] OTA précédente détectée, validation du boot...
[BOOT] Nouvelle version détectée: 3.1 (était 3.0-rebuild)
[BOOT] Firmware validé et marqué comme stable
[OTA] Firmware v3.1 marqué comme stable
```

### Vérification de l'État

Pour vérifier l'état OTA depuis le dashboard, envoyer une commande `PING` et vérifier les logs retournés.

## 📝 Notes Importantes

1. **Compilation requise** : On ne peut pas uploader un `.ino` directement, il faut compiler en `.bin`
2. **Version dans le binaire** : La version est stockée dans une section `.version` lisible depuis le `.bin`
3. **MD5 obligatoire** : Toujours fournir un MD5 pour valider l'intégrité
4. **HTTPS recommandé** : Utiliser HTTPS pour le téléchargement du firmware
5. **Rollback manuel** : En cas d'échec critique, reflash manuel via USB/JTAG reste possible

## 🚀 Workflow Recommandé

1. **Développement** :
   - Modifier le code
   - Changer `FIRMWARE_VERSION_STR` si nouvelle version
   - Compiler et tester localement

2. **Release** :
   - Compiler le firmware
   - Extraire la version : `python extract_version.py firmware.bin`
   - Calculer le MD5
   - Uploader sur serveur HTTPS
   - Enregistrer dans le dashboard avec version + MD5

3. **Déploiement** :
   - Sélectionner le firmware dans le dashboard OTA
   - Choisir les devices cibles
   - Déployer (commande `OTA_REQUEST` envoyée)

4. **Monitoring** :
   - Surveiller les logs des devices
   - Vérifier que la version est bien mise à jour
   - En cas d'échec, logs détaillés disponibles

