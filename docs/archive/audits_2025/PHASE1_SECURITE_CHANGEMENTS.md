# Phase 1 - Sécurité : Changements Effectués

**Date:** 2025-01-27  
**Statut:** ✅ En cours

---

## 🔒 Changements de Sécurité Appliqués

### 1. Headers de Sécurité Ajoutés

**Fichier:** `api.php` (après ligne 49)

**Headers ajoutés:**
- `X-Content-Type-Options: nosniff` - Empêche le MIME sniffing
- `X-Frame-Options: DENY` - Empêche le clickjacking
- `X-XSS-Protection: 1; mode=block` - Protection XSS (navigateurs anciens)
- `Content-Security-Policy` - Politique de sécurité stricte
- `Referrer-Policy: strict-origin-when-cross-origin` - Contrôle des référents
- `Permissions-Policy` - Désactive les APIs sensibles par défaut

**Impact:**
- ✅ Protection contre le clickjacking
- ✅ Protection contre le MIME sniffing
- ✅ Contrôle strict des ressources chargées
- ⚠️ Le CSP peut nécessiter des ajustements selon les besoins du frontend

---

### 2. Fonctions SQL Sécurisées Créées

**Fichier créé:** `api/helpers_sql.php`

**Fonctions créées:**

#### `buildSecureUpdateQuery()`
Fonction principale pour construire des requêtes UPDATE sécurisées avec whitelist de colonnes.

**Caractéristiques:**
- ✅ Validation stricte des noms de table et colonnes
- ✅ Whitelist obligatoire des colonnes autorisées
- ✅ Protection contre l'injection SQL via validation des identifiants
- ✅ Utilisation de requêtes préparées (placeholders)

**Usage:**
```php
$allowedColumns = ['name', 'email', 'status'];
$sql = buildSecureUpdateQuery(
    'users',
    ['name' => 'John', 'email' => 'john@example.com'],
    $allowedColumns,
    ['id' => $user_id],
    $params
);
$stmt = $pdo->prepare($sql);
$stmt->execute($params);
```

#### `buildSecureUpdateQueryAdvanced()`
Pour les cas complexes avec expressions SQL (NULL, NOW(), etc.)

#### `isValidColumn()` et `isValidTableName()`
Fonctions de validation pour vérifier que les identifiants sont sûrs.

#### `escapeSqlIdentifier()`
Échappement sécurisé des identifiants SQL pour PostgreSQL.

**Inclusion:**
- ✅ Fichier inclus dans `api.php` (ligne 10)

---

### 3. Points à Migrer (À Faire)

Les constructions SQL dynamiques suivantes doivent être migrées vers les fonctions sécurisées:

#### A. `api/handlers/devices.php`

**Ligne 346:**
```php
$sql = "UPDATE devices SET " . implode(', ', $updates) . ", updated_at = NOW() WHERE id = :id";
```
**Action:** Migrer vers `buildSecureUpdateQueryAdvanced()` avec whitelist

**Ligne 571:**
```php
$pdo->prepare("UPDATE devices SET " . implode(', ', $updateFields) . " WHERE id = :id")
```
**Action:** Migrer vers `buildSecureUpdateQueryAdvanced()` avec whitelist

**Ligne 678:**
```php
$pdo->prepare("UPDATE devices SET " . implode(', ', $updateFields) . " WHERE id = :id")
```
**Action:** Migrer vers `buildSecureUpdateQueryAdvanced()` avec whitelist

**Ligne 1816:**
```php
UPDATE patients SET " . implode(', ', $updates) . ", updated_at = NOW()
```
**Action:** Migrer vers `buildSecureUpdateQueryAdvanced()` avec whitelist

**Ligne 2077:**
```php
$stmt = $pdo->prepare("UPDATE device_configurations SET " . implode(', ', $updates) . " WHERE device_id = :device_id");
```
**Action:** Migrer vers `buildSecureUpdateQueryAdvanced()` avec whitelist

#### B. `api/handlers/auth.php`

**Ligne 421:**
```php
$stmt = $pdo->prepare("UPDATE users SET " . implode(', ', $updates) . " WHERE id = :id");
```
**Action:** Migrer vers `buildSecureUpdateQueryAdvanced()` avec whitelist

#### C. `api/handlers/notifications.php`

**Ligne 106:**
```php
$sql = "UPDATE user_notifications_preferences SET " . implode(', ', $updates) . " WHERE user_id = :user_id";
```
**Action:** Migrer vers `buildSecureUpdateQueryAdvanced()` avec whitelist

**Ligne 403:**
```php
$sql = "UPDATE user_notifications_preferences SET " . implode(', ', $updates) . " WHERE user_id = :user_id";
```
**Action:** Migrer vers `buildSecureUpdateQueryAdvanced()` avec whitelist

**Ligne 579:**
```php
$sql = "UPDATE patient_notifications_preferences SET " . implode(', ', $updates) . " WHERE patient_id = :patient_id";
```
**Action:** Migrer vers `buildSecureUpdateQueryAdvanced()` avec whitelist

---

## 🔍 Analyse de Sécurité Actuelle

### Points Positifs ✅

1. **Requêtes Préparées:** La plupart des requêtes utilisent déjà des requêtes préparées avec PDO
2. **Validation des Inputs:** Les handlers valident généralement les inputs avant utilisation
3. **Whitelist Implicite:** Dans les constructions dynamiques, les colonnes sont souvent limitées à une liste fixe

### Points à Améliorer ⚠️

1. **Constructions Dynamiques:** 7 endroits avec constructions SQL dynamiques non validées
2. **Noms de Colonnes:** Pas de validation explicite des noms de colonnes avant construction
3. **Expressions SQL:** Certaines constructions permettent des expressions SQL complexes sans validation

---

## 📋 Plan de Migration

### Étape 1: Créer les Whitelists (À Faire)

Pour chaque table concernée, créer des constantes avec les colonnes autorisées:

```php
// Dans api/handlers/devices.php
const DEVICE_UPDATE_ALLOWED_COLUMNS = [
    'device_name', 'status', 'installation_date', 'first_use_date',
    'latitude', 'longitude', 'firmware_version', 'last_seen',
    'last_battery', 'last_flowrate', 'last_rssi', 'patient_id'
];

const PATIENT_UPDATE_ALLOWED_COLUMNS = [
    'first_name', 'last_name', 'birth_date', 'phone', 'email',
    'address', 'city', 'postal_code'
];
```

### Étape 2: Migrer Progressivement (À Faire)

1. Commencer par `api/handlers/devices.php` ligne 346 (le plus simple)
2. Tester après chaque migration
3. Continuer avec les autres fichiers

### Étape 3: Tests de Sécurité (À Faire)

Créer des tests pour vérifier:
- ✅ Rejet des colonnes non autorisées
- ✅ Rejet des noms de table invalides
- ✅ Protection contre l'injection SQL

---

## 🎯 Prochaines Étapes

1. ⏭️ Créer les whitelists de colonnes pour chaque table
2. ⏭️ Migrer la première fonction (devices.php ligne 346)
3. ⏭️ Tester la migration
4. ⏭️ Continuer avec les autres migrations
5. ⏭️ Vérifier l'authentification sur tous les endpoints
6. ⏭️ Ajouter des validators d'input plus stricts

---

## ⚠️ Notes Importantes

### Headers de Sécurité

- Le CSP peut nécessiter des ajustements selon les besoins du frontend
- Si des problèmes apparaissent après l'ajout des headers, vérifier les logs
- Tester en développement avant de déployer en production

### Migrations SQL

- Ne pas migrer tout d'un coup
- Tester après chaque migration
- Garder une sauvegarde avant de commencer
- Vérifier que les performances ne sont pas impactées

---

**Document créé le:** 2025-01-27  
**Statut:** Phase 1 en cours - Infrastructure créée, migrations à faire

