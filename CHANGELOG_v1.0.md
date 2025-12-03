# 📋 Changelog - Version 1.0

## 🎯 Objectif
Implémentation du système de numérotation automatique des dispositifs avec année.

---

## ✅ Modifications apportées

### 1️⃣ **Firmware (fw_ott_optimized.ino)**

#### Changements de version
- **Ancienne version** : `3.8-unified`
- **Nouvelle version** : `1.0`

#### Numérotation par défaut
- **Ancien serial** : `OTT-PIERRE-001`
- **Nouveau serial** : `OTT-XX-XXX` (temporaire, en sortie d'usine)

#### Fonctionnalités ajoutées
- ✅ Détection automatique du serial temporaire au boot
- ✅ Messages informatifs lors de la première connexion
- ✅ Documentation détaillée du système de numérotation

**Extrait du code :**
```cpp
// Numérotation automatique des dispositifs (v1.0)
// À la sortie d'usine, le firmware est flashé avec "OTT-XX-XXX"
// Le backend génère automatiquement un serial définitif : OTT-YY-NNN
//   - YY = année en cours (25 pour 2025, 26 pour 2026, etc.)
//   - NNN = numéro séquentiel à 3 chiffres (001, 002, 003...)
#define OTT_DEFAULT_SERIAL "OTT-XX-XXX"
```

---

### 2️⃣ **Backend - Générateur de serials (device_serial_generator.php)**

#### Format de numérotation
- **Ancien format** : `OTT-001`, `OTT-002`, `OTT-003`
- **Nouveau format** : `OTT-25-001`, `OTT-25-002`, `OTT-26-001`

#### Fonctionnalités ajoutées
- ✅ `generateNextOttSerial()` : Génération avec année
- ✅ `isTemporarySerial()` : Détection des serials temporaires
- ✅ `extractYearFromSerial()` : Extraction de l'année d'un serial

**Logique :**
```php
function generateNextOttSerial($pdo) {
    $currentYear = date('y'); // 25 pour 2025
    
    // Chercher le dernier numéro pour l'année en cours
    // Retourne : OTT-25-001, OTT-25-002, etc.
    
    return sprintf('OTT-%s-%03d', $currentYear, $nextNumber);
}
```

**Exemples :**
| Année | Premier dispositif | Deuxième dispositif | Centième dispositif |
|-------|-------------------|---------------------|---------------------|
| 2025  | `OTT-25-001`      | `OTT-25-002`        | `OTT-25-100`        |
| 2026  | `OTT-26-001`      | `OTT-26-002`        | `OTT-26-100`        |

---

### 3️⃣ **Backend - API Devices (devices.php)**

#### Enregistrement automatique (handleRegisterOrRestoreDevice)
- ✅ Détection automatique du serial temporaire `OTT-XX-XXX`
- ✅ Génération automatique du serial définitif
- ✅ Création d'une commande `UPDATE_CONFIG` pour notifier le firmware
- ✅ Initialisation du `device_name` identique au `device_serial`

**Workflow :**
```
1. Dispositif se connecte avec serial "OTT-XX-XXX"
2. Backend détecte le serial temporaire
3. Backend génère "OTT-25-001"
4. Backend crée le dispositif en base
5. Backend envoie commande UPDATE_CONFIG au firmware
6. Firmware met à jour son serial en NVS
```

#### Attribution patient (handleUpdateDevice)
- ✅ Attribution → `device_name` devient `OTT-25-Prénom Nom`
- ✅ Désattribution → `device_name` redevient `device_serial`

**Exemples :**

| Situation | device_serial | device_name | patient_id |
|-----------|--------------|-------------|------------|
| Sortie usine | `OTT-XX-XXX` | `OTT-XX-XXX` | NULL |
| 1ère connexion | `OTT-25-001` | `OTT-25-001` | NULL |
| Attribution à Pierre Dupont | `OTT-25-001` | `OTT-25-Pierre Dupont` | 42 |
| Désattribution | `OTT-25-001` | `OTT-25-001` | NULL |

---

## 🎨 Règles de nommage (Option 1)

### device_serial (IMMUABLE)
- ✅ Identifiant unique du dispositif
- ✅ Ne change JAMAIS après attribution
- ✅ Format : `OTT-YY-NNN`
- ✅ Utilisé pour traçabilité, logs, API

### device_name (MODIFIABLE)
- ✅ Nom "friendly" du dispositif
- ✅ Modifié lors de l'attribution/désattribution patient
- ✅ Format libre : `OTT-25-Prénom Nom` ou `OTT-25-001`
- ✅ Affiché dans l'interface utilisateur

---

## 🔄 Flux complet

### Scénario 1 : Premier dispositif de 2025

```
[Usine] Dispositif flashé
  ↓ device_serial = "OTT-XX-XXX"
  ↓ device_name = "OTT-XX-XXX"
  
[Première connexion OTA/USB]
  ↓ Backend détecte serial temporaire
  ↓ Backend génère "OTT-25-001"
  ↓ device_serial = "OTT-25-001" (en DB)
  ↓ device_name = "OTT-25-001" (en DB)
  ↓ Commande UPDATE_CONFIG envoyée
  
[Firmware reçoit UPDATE_CONFIG]
  ↓ Met à jour DEVICE_SERIAL en NVS
  ↓ device_serial = "OTT-25-001" (en NVS)
  ↓ Redémarre avec nouveau serial
  
[Attribution à Pierre Dupont]
  ↓ device_serial = "OTT-25-001" (INCHANGÉ)
  ↓ device_name = "OTT-25-Pierre Dupont" (MODIFIÉ)
  ↓ patient_id = 42
  
[Désattribution]
  ↓ device_serial = "OTT-25-001" (INCHANGÉ)
  ↓ device_name = "OTT-25-001" (RÉINITIALISÉ)
  ↓ patient_id = NULL
```

### Scénario 2 : Changement d'année

```
[Dernier dispositif de 2025]
  device_serial = "OTT-25-150"
  
[Premier dispositif de 2026]
  device_serial = "OTT-26-001" ← Recommence à 001
```

---

## ✅ Tests à effectuer

### Test 1 : Enregistrement nouveau dispositif
1. Flasher firmware v1.0 (serial par défaut : `OTT-XX-XXX`)
2. Connecter en USB ou OTA
3. Vérifier dans le dashboard : `device_serial = OTT-25-001`
4. Vérifier les logs firmware : message "Serial temporaire détecté"
5. Vérifier commande OTA créée : `UPDATE_CONFIG` avec payload `{"serial":"OTT-25-001"}`

### Test 2 : Attribution patient
1. Créer un patient "Pierre Dupont"
2. Assigner le dispositif `OTT-25-001` au patient
3. Vérifier `device_name = "OTT-25-Pierre Dupont"`
4. Vérifier `device_serial = "OTT-25-001"` (INCHANGÉ)

### Test 3 : Désattribution patient
1. Désassigner le dispositif du patient
2. Vérifier `device_name = "OTT-25-001"` (réinitialisé)
3. Vérifier `patient_id = NULL`

### Test 4 : Multiple dispositifs
1. Connecter 3 dispositifs avec serial temporaire
2. Vérifier génération : `OTT-25-001`, `OTT-25-002`, `OTT-25-003`
3. Vérifier pas de doublons en base

### Test 5 : Changement d'année (simulation)
1. Modifier date système → 2026
2. Connecter nouveau dispositif
3. Vérifier génération : `OTT-26-001`

---

## 📊 Compatibilité

### Rétrocompatibilité
- ✅ Les anciens dispositifs avec format `OTT-001` restent valides
- ✅ Cohabitation ancien/nouveau format possible
- ✅ Pas de migration nécessaire

### Migration (optionnelle)
Si vous souhaitez migrer les anciens dispositifs :

```sql
-- Exemple de migration pour ajouter l'année aux anciens dispositifs
UPDATE devices 
SET device_serial = CONCAT('OTT-25-', LPAD(SUBSTRING(device_serial FROM 5), 3, '0'))
WHERE device_serial LIKE 'OTT-%' 
  AND device_serial NOT LIKE 'OTT-__-___';
```

⚠️ **ATTENTION** : Cette migration est optionnelle et IRRÉVERSIBLE !

---

## 🔒 Sécurité

- ✅ `device_serial` est IMMUABLE après attribution
- ✅ Validation de l'existence du patient avant attribution
- ✅ Logs de toutes les modifications (audit trail)
- ✅ Pas de collision possible (auto-incrémentation par année)

---

## 📝 Notes importantes

1. **device_serial** = Identifiant unique technique (JAMAIS modifié)
2. **device_name** = Nom d'usage (modifié selon patient)
3. La numérotation recommence à 001 chaque année
4. Format année sur 2 chiffres (25 = 2025, 26 = 2026)
5. Maximum 999 dispositifs par an (OTT-YY-999)

---

## 🚀 Prochaines étapes

1. ✅ Tests unitaires
2. ✅ Tests d'intégration (USB + OTA)
3. ✅ Validation avec dispositifs réels
4. ✅ Mise à jour documentation utilisateur
5. ✅ Formation équipe technique

---

## 📞 Support

En cas de problème, vérifier :
1. Version firmware = `1.0`
2. Logs backend : `[Device Registration] Serial temporaire détecté`
3. Commandes OTA : Présence de `UPDATE_CONFIG`
4. NVS firmware : `prefs.getString("serial")` après UPDATE_CONFIG

---

**Version du changelog** : 1.0  
**Date de création** : 3 décembre 2024  
**Auteur** : Équipe OTT

