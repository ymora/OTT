# Arduino15 Pre-installed Packages

Ce dossier contient les packages Arduino pré-installés pour accélérer la compilation.

## Structure

```
.arduino15/
├── packages/
│   └── esp32/
│       └── hardware/
│           └── esp32/
│               └── 3.3.4/          # Core ESP32 pré-installé (48 MB)
└── README.md
```

## Pourquoi ?

La compilation avec arduino-cli nécessite :
1. **Core ESP32** (hardware) : ~48 MB → ✅ Inclus dans Git
2. **Tools** (compilateurs, binaires) : ~5.4 GB → ❌ Trop gros pour Git

En incluant le core dans Git :
- Arduino-cli détecte "déjà installé" et ne télécharge pas le core
- Seuls les tools seront téléchargés (une seule fois sur Render)
- Compilation : 2 minutes au lieu de 10-30 minutes

## Utilisation

Le code dans `api/handlers/firmwares/compile.php` utilise automatiquement ce dossier :

```php
$env['ARDUINO_DIRECTORIES_DATA'] = $root_dir . '/.arduino15';
```

Arduino-cli détectera automatiquement les packages pré-installés.

## Mise à jour

Pour mettre à jour le core ESP32 :

```bash
# 1. Installer/Mettre à jour localement
arduino-cli core update-index
arduino-cli core install esp32:esp32@3.3.4

# 2. Copier dans le projet
cp -r "$HOME/.arduino15/packages/esp32/hardware" .arduino15/packages/esp32/

# 3. Commit dans Git
git add .arduino15/
git commit -m "Update ESP32 core to 3.3.4"
```

## Notes

- Les tools (~5.4 GB) ne sont PAS inclus dans Git
- Sur Render, ils seront téléchargés une fois et persistés via volume
- Cela évite de prendre un abonnement payant pour le stockage Git

