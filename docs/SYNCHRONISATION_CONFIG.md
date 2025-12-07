# 🔄 Synchronisation des Paramètres de Configuration - Base de Données = Maître

## 📋 Problème Identifié

Actuellement, lorsqu'un dispositif envoie une mesure avec des paramètres de configuration (`sleep_minutes`, `measurement_duration_ms`, `calibration_coefficients`), le code dans `handlePostMeasurement()` **écrase automatiquement** la configuration dans la base de données (lignes 163-197).

**Scénario problématique :**
1. ✅ Admin configure dans la base : `sleep_minutes = 60`, `calibration = [1, 2, 3]`
2. ❌ Dispositif non connecté a ses propres paramètres : `sleep_minutes = 30`, `calibration = [0, 1, 0]`
3. 🔌 Dispositif se connecte et envoie une mesure avec ses paramètres
4. ❌ **La base de données est écrasée** avec les paramètres du dispositif au lieu de l'inverse

## ✅ Solution : Base de Données = Maître

### Principe
- **La base de données est la source de vérité** pour la configuration
- **Le dispositif doit se synchroniser** avec la base de données
- Si les paramètres diffèrent, **une commande `UPDATE_CONFIG` est créée automatiquement** pour forcer le dispositif à se mettre à jour

### Comportement Attendu

#### Scénario 1 : Configuration dans la base, dispositif se connecte avec paramètres différents
1. ✅ Admin configure dans la base : `sleep_minutes = 60`
2. 🔌 Dispositif se connecte avec : `sleep_minutes = 30`
3. 🔍 **L'API détecte la différence**
4. 📤 **L'API crée une commande `UPDATE_CONFIG`** avec `sleep_minutes = 60`
5. ✅ **Le dispositif reçoit la commande** et met à jour ses paramètres
6. ✅ **La base de données conserve ses valeurs** (non écrasées)

#### Scénario 2 : Configuration dans la base, dispositif se connecte sans paramètres
1. ✅ Admin configure dans la base : `sleep_minutes = 60`
2. 🔌 Dispositif se connecte **sans envoyer de paramètres de config**
3. 📤 **L'API envoie automatiquement la config de la base** dans les commandes en attente
4. ✅ **Le dispositif applique la config de la base**

#### Scénario 3 : Pas de config dans la base, dispositif envoie ses paramètres
1. ❌ Pas de configuration dans la base (valeurs NULL)
2. 🔌 Dispositif se connecte avec : `sleep_minutes = 30`
3. ✅ **L'API enregistre les paramètres du dispositif dans la base** (première initialisation)
4. ✅ **Pas de commande UPDATE_CONFIG** (les valeurs sont identiques)

## 🔧 Modifications Nécessaires

### 1. Modifier `handlePostMeasurement()` dans `api/handlers/devices/measurements.php`

**AVANT** (lignes 163-197) :
- ❌ Le dispositif peut écraser la config de la base

**APRÈS** :
- ✅ Si le dispositif envoie des paramètres, **comparer avec la base**
- ✅ Si différences détectées → **créer commande `UPDATE_CONFIG`**
- ✅ Si pas de config dans la base (NULL) → **initialiser avec les valeurs du dispositif**
- ✅ Sinon → **ignorer les paramètres du dispositif** (base = maître)

### 2. Logique de Comparaison

Comparer les paramètres suivants :
- `sleep_minutes`
- `measurement_duration_ms`
- `send_every_n_wakeups`
- `calibration_coefficients` (tableau JSON)
- `gps_enabled`

**Règles :**
- Si paramètre présent dans la base (non NULL) ET différent du dispositif → créer commande UPDATE_CONFIG
- Si paramètre NULL dans la base ET présent dans le dispositif → initialiser la base (première fois)
- Si paramètres identiques → ne rien faire

### 3. Création Automatique de Commande UPDATE_CONFIG

Quand une différence est détectée :
```php
INSERT INTO device_commands (device_id, command, payload, status, priority)
VALUES (:device_id, 'UPDATE_CONFIG', :payload::jsonb, 'pending', 'high')
```

Le dispositif devra interroger les commandes en attente et les appliquer.

## 📝 Exemple de Code

```php
// 1. Récupérer la config de la base
$dbConfig = getDeviceConfigFromDB($device_id);

// 2. Extraire la config du dispositif (s'il l'envoie)
$deviceConfig = [
    'sleep_minutes' => $input['sleep_minutes'] ?? null,
    'measurement_duration_ms' => $input['measurement_duration_ms'] ?? null,
    'send_every_n_wakeups' => $input['send_every_n_wakeups'] ?? null,
    'calibration_coefficients' => $input['calibration_coefficients'] ?? null,
    'gps_enabled' => $input['gps_enabled'] ?? null
];

// 3. Comparer et créer commande si différences
$diffConfig = compareConfigs($dbConfig, $deviceConfig);
if (!empty($diffConfig)) {
    createUpdateConfigCommand($device_id, $diffConfig);
}
```

## ✅ Avantages

1. **Base de données = source de vérité unique**
2. **Cohérence garantie** : tous les dispositifs suivent la même configuration
3. **Gestion centralisée** : l'admin configure dans la base, tous les dispositifs suivent
4. **Synchronisation automatique** : détection et correction des écarts

## 🚀 Prochaines Étapes

1. ✅ Analyser le code actuel
2. 🔨 Modifier `handlePostMeasurement()` pour implémenter la logique "base = maître"
3. 🧪 Tester les différents scénarios
4. 📝 Documenter les changements

