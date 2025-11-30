# Logique de Synchronisation USB/OTA

## Principe de Source de Vérité Hiérarchique

### Priorité 1 : USB (quand connecté)
- **Source de vérité absolue** quand un dispositif est connecté en USB
- Les modifications USB sont appliquées immédiatement
- Les commandes OTA sont détectées mais **non appliquées** en mode USB (pour éviter les conflits)

### Priorité 2 : Base de données (quand USB non connecté)
- Source de vérité quand le dispositif n'est pas connecté en USB
- Les modifications sont envoyées via OTA et appliquées au prochain réveil

### Priorité 3 : Firmware local
- Valeurs par défaut stockées dans le firmware
- Utilisées uniquement si aucune configuration n'est disponible

## Flux de Synchronisation

### 1. Connexion USB
```
Firmware → Dashboard
  ├─ device_info (ICCID, Serial, Firmware version)
  └─ device_config (sleep_minutes, measurement_duration_ms, calibration_coefficients)
```
**Action** : Le dashboard affiche la configuration actuelle du firmware

### 2. Modification en Mode USB
```
Dashboard → Firmware (via commandes USB directes)
  ├─ config {...} → Sauvegarde immédiate dans le firmware
  └─ calibration {...} → Sauvegarde immédiate dans le firmware
```
**Action** : 
- Configuration appliquée immédiatement
- Sauvegardée dans le firmware (NVS)
- Optionnellement synchronisée avec la base de données (pour historique)

### 3. Modification en Mode OTA
```
Dashboard → Base de données → Commande OTA → Firmware (au prochain réveil)
  ├─ UPDATE_CONFIG → Appliquée au réveil
  └─ UPDATE_CALIBRATION → Appliquée au réveil
```
**Action** :
- Commande OTA créée dans la base de données
- Appliquée au prochain réveil du dispositif (quand USB non connecté)

### 4. Mode USB Actif (Vérification OTA)
```
Firmware (mode USB) → Vérifie commandes OTA toutes les 30s
  └─ Détecte mais n'applique PAS (pour éviter conflit)
```
**Action** :
- Les commandes OTA sont détectées mais non appliquées
- Message informatif : "Commandes OTA disponibles - Application différée (mode USB actif)"
- Les commandes seront appliquées après déconnexion USB

## Règles de Non-Conflit

### Règle 1 : USB Prioritaire
- Quand USB connecté : Toutes les modifications passent par USB
- Les commandes OTA en attente ne sont pas appliquées

### Règle 2 : Pas de Boucle Infinie
- Le firmware n'envoie sa config que :
  - À la connexion USB (device_config)
  - En réponse à une commande explicite (si ajoutée)
- Le dashboard ne renvoie pas automatiquement la config reçue

### Règle 3 : Synchronisation Unidirectionnelle
- **USB → Dashboard** : À la connexion uniquement
- **Dashboard → USB** : Quand l'utilisateur modifie la config
- **Dashboard → OTA** : Quand USB non connecté

## Séquence Logique Complète

### Scénario 1 : Connexion USB puis Modification
1. USB connecté → Firmware envoie `device_info` + `device_config`
2. Dashboard affiche la config actuelle
3. Utilisateur modifie → Dashboard envoie `config {...}` via USB
4. Firmware applique et sauvegarde
5. **Pas de renvoi automatique** de la config (évite boucle)

### Scénario 2 : Modification OTA puis Connexion USB
1. Commande OTA créée dans la base
2. USB connecté → Firmware envoie sa config actuelle (pas encore modifiée par OTA)
3. Dashboard affiche la config actuelle du firmware
4. Les commandes OTA sont détectées mais non appliquées (mode USB actif)
5. Après déconnexion USB → Les commandes OTA seront appliquées au prochain réveil

### Scénario 3 : Modification USB puis Déconnexion
1. Modification USB → Firmware sauvegarde
2. USB déconnecté → Firmware reprend mode normal
3. Au prochain réveil → Firmware récupère et applique les commandes OTA en attente
4. Si conflit : La dernière modification (USB) est déjà dans le firmware, les commandes OTA peuvent être ignorées ou appliquées selon leur timestamp

## Implémentation

### Firmware
- Envoie `device_config` uniquement à la connexion USB
- Détecte les commandes OTA en mode USB mais ne les applique pas
- Applique les commandes OTA uniquement en mode normal (non-USB)

### Dashboard
- Affiche toujours la configuration (même si pas connecté)
- Récupère la config du firmware à la connexion USB
- Envoie les modifications via USB si connecté, sinon via OTA
- Ne renvoie pas automatiquement la config reçue (évite boucle)

