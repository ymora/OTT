# Correction des Statistiques Administrateurs OTT

## Problème Identifié
Le deuxième administrateur (Maxime Happlyz Medical) n'était pas compté dans les statistiques en raison d'une erreur dans les requêtes SQL du fichier `statistics.php`.

## Modifications Effectuées

### 1. Correction de `api/handlers/statistics.php`

#### Avant (incorrect) :
```sql
COUNT(CASE WHEN role = 'admin' THEN 1 END) as admin_users,
COUNT(CASE WHEN role = 'technician' THEN 1 END) as technician_users
```

#### Après (corrigé) :
```sql
COUNT(CASE WHEN role_id = 1 THEN 1 END) as admin_users,
COUNT(CASE WHEN role_id = 3 THEN 1 END) as technician_users
WHERE deleted_at IS NULL
```

### 2. Correction de l'activité par rôle

#### Avant (incorrect) :
```sql
SELECT u.role, COUNT(*) as user_count
FROM users u
GROUP BY u.role
```

#### Après (corrigé) :
```sql
SELECT r.name as role, COUNT(*) as user_count
FROM users u
JOIN roles r ON u.role_id = r.id
WHERE u.deleted_at IS NULL
GROUP BY u.role_id, r.name
```

### 3. Ajout du handler statistics au routeur

Ajout de la ligne dans `api/routing/api_router.php` :
```php
require_once __DIR__ . '/../handlers/statistics.php';
```

## Administrateurs Maintenant Comptés

1. **Yann Mora** (ymora@free.fr) - ID: 1 - role_id: 1
2. **Maxime Happlyz Medical** (Maxime@happlyzmedical.com) - ID: 2 - role_id: 1

## Endpoints Disponibles

- `GET /api.php/statistics` - Statistiques générales
- `GET /api.php/statistics/performance` - Statistiques de performance  
- `GET /api.php/statistics/usage` - Statistiques d'utilisation
- `GET /api.php/statistics/errors` - Statistiques d'erreurs

## Vérification

Les requêtes SQL utilisent maintenant correctement :
- `role_id = 1` pour les administrateurs
- `role_id = 3` pour les techniciens  
- `WHERE deleted_at IS NULL` pour exclure les utilisateurs supprimés
- Jointure avec la table `roles` pour obtenir les noms de rôles

Le deuxième administrateur est maintenant correctement compté dans toutes les statistiques du système OTT.
