# Test Migration Configuration - Résultats

## Problème Identifié

Les colonnes pour les nouveaux paramètres de configuration n'existaient pas en base de données, ce qui empêchait :
- La sauvegarde complète des paramètres
- Le rechargement des paramètres dans le modal

## Solution Appliquée

### 1. Création Automatique des Colonnes

L'API crée maintenant **automatiquement** les colonnes manquantes lors de la première sauvegarde de configuration :

```php
// Dans handleUpdateDeviceConfig()
// Créer les colonnes manquantes automatiquement si elles n'existent pas
$columnsToAdd = [
    'airflow_passes' => 'INTEGER',
    'airflow_samples_per_pass' => 'INTEGER',
    'airflow_delay_ms' => 'INTEGER',
    'watchdog_seconds' => 'INTEGER',
    'modem_boot_timeout_ms' => 'INTEGER',
    'sim_ready_timeout_ms' => 'INTEGER',
    'network_attach_timeout_ms' => 'INTEGER',
    'modem_max_reboots' => 'INTEGER',
    'apn' => 'VARCHAR(64)',
    'sim_pin' => 'VARCHAR(8)',
    'ota_primary_url' => 'TEXT',
    'ota_fallback_url' => 'TEXT',
    'ota_md5' => 'VARCHAR(32)'
];
```

### 2. Scripts de Test et Migration

**Scripts créés** :
- `scripts/test-config-migration.ps1` : Test complet de la migration
- `scripts/run-config-migration.ps1` : Exécution de la migration complète
- `scripts/run-config-migration-simple.ps1` : Migration SQL simple
- `sql/add_config_columns.sql` : Script SQL pour migration manuelle

## Comment Tester

### Option 1 : Test Automatique (Recommandé)

1. **Ouvrir le modal de configuration** d'un dispositif
2. **Modifier n'importe quel paramètre** (même juste changer l'APN)
3. **Sauvegarder**
4. Les colonnes seront créées automatiquement lors de la sauvegarde
5. **Fermer et rouvrir le modal** → Tous les paramètres doivent être présents

### Option 2 : Test avec Script PowerShell

```powershell
# Tester la migration
.\scripts\test-config-migration.ps1 -API_URL "http://localhost:3000"

# Ou exécuter la migration manuellement
.\scripts\run-config-migration.ps1 -API_URL "http://localhost:3000"
```

### Option 3 : Migration SQL Manuelle

Si vous préférez exécuter la migration manuellement en SQL :

```bash
# Via psql
psql -h <host> -U <user> -d <database> -f sql/add_config_columns.sql

# Ou copier-coller le contenu de sql/add_config_columns.sql dans votre client SQL
```

## Vérification

Après la migration, vérifier que :

1. ✅ **Tous les champs sont présents** dans la réponse GET `/api.php/devices/{id}/config`
2. ✅ **Tous les paramètres sont sauvegardés** lors d'un PUT `/api.php/devices/{id}/config`
3. ✅ **Tous les paramètres sont rechargés** correctement dans le modal

## Colonnes Ajoutées

Les colonnes suivantes sont maintenant disponibles :

- `airflow_passes` (INTEGER)
- `airflow_samples_per_pass` (INTEGER)
- `airflow_delay_ms` (INTEGER)
- `watchdog_seconds` (INTEGER)
- `modem_boot_timeout_ms` (INTEGER)
- `sim_ready_timeout_ms` (INTEGER)
- `network_attach_timeout_ms` (INTEGER)
- `modem_max_reboots` (INTEGER)
- `apn` (VARCHAR(64))
- `sim_pin` (VARCHAR(8))
- `ota_primary_url` (TEXT)
- `ota_fallback_url` (TEXT)
- `ota_md5` (VARCHAR(32))

## Notes

- ⚠️ **Création automatique** : Les colonnes sont créées lors de la première sauvegarde de configuration
- ✅ **Idempotent** : Utilise `ADD COLUMN IF NOT EXISTS`, donc peut être exécuté plusieurs fois sans erreur
- ✅ **Rétrocompatible** : Les anciennes configurations continuent de fonctionner

## Prochaines Étapes

1. **Tester en production** : Ouvrir le modal, modifier un paramètre, sauvegarder
2. **Vérifier** : Fermer et rouvrir le modal → les paramètres doivent être présents
3. **Confirmer** : Tous les paramètres sont maintenant sauvegardés et rechargés correctement

