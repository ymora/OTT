# 📚 Explication : Requêtes SQL N+1

## 🎯 Qu'est-ce qu'une requête N+1 ?

Une requête **N+1** est un problème de performance où, au lieu d'exécuter **1 seule requête** pour récupérer toutes les données nécessaires, le code exécute **1 requête initiale + N requêtes supplémentaires** (une pour chaque élément).

## 📊 Exemple Concret

### ❌ Code avec problème N+1

```php
// 1 requête : Récupérer tous les dispositifs
$devices = $pdo->query("SELECT * FROM devices")->fetchAll();

// N requêtes : Pour CHAQUE dispositif, récupérer ses mesures
foreach ($devices as $device) {
    // ⚠️ PROBLÈME : Une requête par dispositif !
    $measurements = $pdo->query("SELECT * FROM measurements WHERE device_id = {$device['id']}")->fetchAll();
    $device['measurements'] = $measurements;
}
```

**Résultat :**
- Si vous avez **10 dispositifs**, cela fait **1 + 10 = 11 requêtes SQL**
- Si vous avez **100 dispositifs**, cela fait **1 + 100 = 101 requêtes SQL** ! 😱

### ✅ Code Optimisé (sans N+1)

```php
// 1 seule requête : Récupérer tous les dispositifs ET leurs mesures en une fois
$devices = $pdo->query("
    SELECT 
        d.*,
        m.id as measurement_id,
        m.value,
        m.timestamp
    FROM devices d
    LEFT JOIN measurements m ON m.device_id = d.id
    ORDER BY d.id, m.timestamp DESC
")->fetchAll();

// Grouper les mesures par dispositif (en mémoire, très rapide)
$devicesWithMeasurements = [];
foreach ($devices as $row) {
    $deviceId = $row['id'];
    if (!isset($devicesWithMeasurements[$deviceId])) {
        $devicesWithMeasurements[$deviceId] = [
            'id' => $row['id'],
            'name' => $row['name'],
            'measurements' => []
        ];
    }
    if ($row['measurement_id']) {
        $devicesWithMeasurements[$deviceId]['measurements'][] = [
            'id' => $row['measurement_id'],
            'value' => $row['value'],
            'timestamp' => $row['timestamp']
        ];
    }
}
```

**Résultat :**
- **1 seule requête SQL** pour récupérer tous les dispositifs et leurs mesures
- **Beaucoup plus rapide** ! ⚡

## 🔍 Pourquoi c'est un Problème ?

### Performance

**Exemple avec 100 dispositifs :**

| Approche | Nombre de Requêtes | Temps Estimé |
|----------|-------------------|--------------|
| ❌ N+1 | 101 requêtes | ~2-5 secondes |
| ✅ JOIN | 1 requête | ~0.1 seconde |

**Différence : 20-50x plus rapide !**

### Charge Serveur

- Chaque requête SQL a un coût (connexion, parsing, exécution, réseau)
- 100 requêtes = 100x plus de charge sur la base de données
- Risque de ralentir tout le serveur

## 🎯 Comment Détecter les N+1 ?

### Pattern à Chercher

```php
// ⚠️ PATTERN SUSPECT : Requête SQL dans une boucle
foreach ($items as $item) {
    // Requête SQL ici = probablement N+1
    $related = $pdo->query("SELECT * FROM related WHERE item_id = {$item['id']}");
}
```

### Dans le Code OTT

L'audit détecte automatiquement ces patterns :
- `SELECT` dans une boucle `foreach/while/for`
- `fetch/fetchAll` dans une boucle sans `JOIN` préalable

## ✅ Solutions

### 1. Utiliser JOIN (recommandé)

```php
// Une seule requête avec JOIN
SELECT d.*, m.* 
FROM devices d 
LEFT JOIN measurements m ON m.device_id = d.id
```

### 2. Utiliser IN avec Liste d'IDs

```php
// Récupérer tous les IDs
$deviceIds = array_column($devices, 'id');

// Une seule requête pour toutes les mesures
$measurements = $pdo->query("
    SELECT * FROM measurements 
    WHERE device_id IN (" . implode(',', $deviceIds) . ")
")->fetchAll();

// Grouper en mémoire
$measurementsByDevice = [];
foreach ($measurements as $m) {
    $measurementsByDevice[$m['device_id']][] = $m;
}
```

### 3. Utiliser des Requêtes Groupées (Batch)

```php
// Au lieu de faire une requête par dispositif
// Faire une requête pour 10 dispositifs à la fois
$chunks = array_chunk($devices, 10);
foreach ($chunks as $chunk) {
    $ids = array_column($chunk, 'id');
    $measurements = $pdo->query("
        SELECT * FROM measurements 
        WHERE device_id IN (" . implode(',', $ids) . ")
    ")->fetchAll();
}
```

## 📊 Exemple Réel dans le Projet OTT

### Scénario : Afficher la liste des dispositifs avec leurs dernières mesures

**❌ Approche N+1 (lente) :**
```php
$devices = getDevices(); // 1 requête

foreach ($devices as $device) {
    $device['last_measurement'] = getLastMeasurement($device['id']); // N requêtes
}
```

**✅ Approche Optimisée (rapide) :**
```php
// 1 seule requête avec JOIN
$devices = $pdo->query("
    SELECT 
        d.*,
        m.value as last_value,
        m.timestamp as last_timestamp
    FROM devices d
    LEFT JOIN LATERAL (
        SELECT value, timestamp 
        FROM measurements 
        WHERE device_id = d.id 
        ORDER BY timestamp DESC 
        LIMIT 1
    ) m ON true
")->fetchAll();
```

## 🎓 Résumé

| Concept | Description |
|---------|-------------|
| **N+1** | 1 requête initiale + N requêtes supplémentaires (une par élément) |
| **Problème** | Performance dégradée, charge serveur élevée |
| **Solution** | Utiliser JOIN, IN, ou requêtes groupées |
| **Détection** | Requête SQL dans une boucle |

## 💡 Règle d'Or

> **Si vous avez une boucle et une requête SQL à l'intérieur, c'est probablement un problème N+1 !**

**Solution :** Sortir la requête de la boucle et utiliser JOIN ou IN.

