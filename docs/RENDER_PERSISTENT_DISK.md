# Configuration du Persistent Disk pour arduino-data sur Render

Ce guide vous explique comment configurer un disque persistant sur Render pour conserver le core ESP32 dans `arduino-data/` et éviter de le retélécharger à chaque déploiement.

## 📋 Prérequis

- Un service Render déjà déployé (ott-api)
- Accès au dashboard Render

## 🔧 Configuration via le Dashboard Render

### Étape 1 : Accéder à votre service

1. Connectez-vous à votre compte Render : https://dashboard.render.com
2. Sélectionnez votre service **ott-api** dans la liste des services

### Étape 2 : Ajouter un Persistent Disk

1. Dans la page de votre service, cliquez sur l'onglet **Disks** (ou **Settings** → **Disks**)
2. Cliquez sur le bouton **Add Disk** ou **+ Add Disk**

### Étape 3 : Configurer le disque

Configurez le disque avec les paramètres suivants :

- **Mount Path** : `/opt/render/project/src/hardware/arduino-data`
- **Size** : `1 GB` (minimum recommandé, ~430MB pour le core ESP32)
- **Name** (optionnel) : `arduino-data-disk`

### Étape 4 : Enregistrer et déployer

1. Cliquez sur **Add Disk** pour enregistrer la configuration
2. Render déclenchera automatiquement un nouveau déploiement pour appliquer les modifications

## ✅ Vérification

Après le déploiement, vérifiez que le disque est bien monté :

1. Allez dans les logs de votre service sur Render
2. Vous devriez voir : `✅ Core ESP32 déjà installé dans /opt/render/project/src/hardware/arduino-data`
3. Les compilations futures ne téléchargeront plus le core (il sera déjà installé)

## ⚠️ Notes importantes

### Limitations

- **Zero-downtime deploys désactivés** : L'ajout d'un persistent disk empêche les déploiements sans interruption. L'instance existante est arrêtée avant que la nouvelle ne soit mise en ligne.
- **Une seule instance** : Un persistent disk est accessible uniquement par une seule instance de service.
- **Taille** : Vous pouvez augmenter la taille du disque plus tard, mais pas la réduire.

### Avantages

- **Persistance** : Les données dans `/opt/render/project/src/hardware/arduino-data` sont conservées entre les déploiements
- **Pas de retéléchargement** : Le core ESP32 (~430MB) n'est téléchargé qu'une seule fois
- **Déploiements plus rapides** : Les builds sont plus rapides car le core est déjà installé

## 🔍 Vérification dans le code

Le code PHP utilise automatiquement le chemin correct :

```php
$arduinoDataDir = __DIR__ . '/../../hardware/arduino-data';
```

Sur Render, `__DIR__` (dans `api/handlers/firmwares.php`) pointe vers `/opt/render/project/src/api/handlers`, donc le chemin final sera :
- `/opt/render/project/src/hardware/arduino-data` ✅

C'est exactement le chemin de montage du persistent disk !

## 🐛 Troubleshooting

### Le core est retéléchargé à chaque build

1. Vérifiez que le persistent disk est bien configuré dans le dashboard Render
2. Vérifiez que le **Mount Path** est exactement : `/opt/render/project/src/hardware/arduino-data`
3. Vérifiez les logs du build pour voir si le répertoire est créé correctement

### Le disque n'apparaît pas

1. Attendez que le déploiement soit terminé
2. Vérifiez dans l'onglet **Disks** de votre service que le disque est listé
3. Contactez le support Render si le problème persiste

## 📚 Références

- [Documentation officielle Render - Persistent Disks](https://render.com/docs/disks)
- [Community Render - Files in Render disk are being lost](https://community.render.com/t/files-in-render-disk-are-being-lost-with-starter-service/17440)

