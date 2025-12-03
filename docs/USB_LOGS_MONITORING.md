# 📡 Monitoring USB à Distance

## Vue d'ensemble

Cette fonctionnalité permet aux administrateurs de consulter en temps réel les logs des dispositifs USB connectés sur les PC locaux des utilisateurs, directement depuis l'interface web.

## Fonctionnalités

✅ **Synchronisation automatique** : Les logs sont envoyés automatiquement du PC local vers le serveur toutes les 5 secondes  
✅ **Filtrage avancé** : Filtrer par dispositif, source (firmware/dashboard), et nombre de logs  
✅ **Auto-refresh** : Actualisation automatique de l'affichage toutes les 5 secondes  
✅ **Rétention intelligente** : Conservation des logs pendant 7 jours, suppression automatique des plus anciens  
✅ **Accès sécurisé** : Accessible uniquement aux administrateurs  

## Architecture

### 1. Base de données

**Table `usb_logs`** :
```sql
CREATE TABLE usb_logs (
  id SERIAL PRIMARY KEY,
  device_identifier VARCHAR(255) NOT NULL,
  device_name VARCHAR(255),
  log_line TEXT NOT NULL,
  log_source VARCHAR(20) DEFAULT 'device',
  user_id INT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Vue `usb_logs_view`** : Jointure avec les tables `users` et `devices` pour faciliter les requêtes

**Fonction `cleanup_old_usb_logs()`** : Supprime automatiquement les logs de plus de 7 jours

### 2. API

**Endpoints** :

- `POST /api.php/usb-logs` : Enregistrer des logs (batch de max 100 logs)
- `GET /api.php/usb-logs` : Récupérer tous les logs (avec pagination et filtres)
- `GET /api.php/usb-logs/:device` : Récupérer les logs d'un dispositif spécifique
- `DELETE /api.php/usb-logs/cleanup` : Nettoyer manuellement les vieux logs

**Paramètres de requête** :
- `device` : Filtrer par identifiant de dispositif
- `source` : Filtrer par source (`device` ou `dashboard`)
- `limit` : Nombre de logs à récupérer (max 1000)
- `offset` : Décalage pour la pagination
- `since` : Timestamp en millisecondes (récupérer uniquement les logs depuis cette date)

### 3. Frontend

**Composants** :

- `UsbLogsViewer.js` : Composant React pour afficher les logs avec filtres et auto-refresh
- `app/dashboard/admin/usb-logs/page.js` : Page d'administration dédiée

**Contexte USB** :

Le contexte `UsbContext.js` a été modifié pour :
1. Collecter tous les logs dans un buffer local
2. Envoyer automatiquement les logs au serveur toutes les 5 secondes
3. Limiter le buffer à 200 logs pour éviter la surcharge mémoire

## Installation

### Méthode 1 : Script automatique (Windows)

```powershell
# Depuis la racine du projet
.\scripts\install_usb_logs.ps1
```

### Méthode 2 : Migration manuelle

```bash
# Via l'API (nécessite d'être admin)
curl -X POST http://localhost:3000/api.php/migrate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d "file=migration_add_usb_logs.sql"
```

### Méthode 3 : psql direct

```bash
psql -h localhost -U your_user -d your_database -f sql/migration_add_usb_logs.sql
```

## Utilisation

### Pour les administrateurs

1. **Accéder à la page de monitoring** :
   - Ouvrir l'interface web : `http://localhost:3000/dashboard`
   - Cliquer sur **"📡 Logs USB"** dans le menu latéral
   - Ou accéder directement à : `http://localhost:3000/dashboard/admin/usb-logs`

2. **Filtrer les logs** :
   - **Dispositif** : Sélectionner un dispositif spécifique ou "Tous les dispositifs"
   - **Source** : Filtrer par "Firmware" (logs du dispositif) ou "Dashboard" (logs de l'interface)
   - **Limite** : Nombre de logs à afficher (50, 100, 200, 500, 1000)

3. **Actualiser** :
   - Activer/désactiver l'auto-refresh avec le toggle
   - Cliquer sur "🔄 Actualiser" pour forcer l'actualisation

4. **Nettoyer les vieux logs** :
   - Cliquer sur "🗑️ Nettoyer" pour supprimer tous les logs de plus de 7 jours

### Pour les utilisateurs

Rien à faire ! Les logs sont automatiquement envoyés au serveur lorsque vous connectez un dispositif USB et démarrez le streaming.

## Sécurité

- ✅ **Authentification requise** : Tous les endpoints nécessitent un token JWT valide
- ✅ **Autorisation admin** : Seuls les administrateurs peuvent consulter les logs
- ✅ **Limitation du batch** : Maximum 100 logs par requête pour éviter les abus
- ✅ **Rétention limitée** : Conservation de 7 jours seulement
- ✅ **Validation des données** : Tous les paramètres sont validés côté serveur

## Performance

### Optimisations

1. **Index sur les colonnes** :
   - `device_identifier` : Recherche rapide par dispositif
   - `created_at` : Tri chronologique performant
   - Index composite : `(device_identifier, created_at)` pour les requêtes combinées

2. **Batch d'envoi** :
   - Les logs sont regroupés et envoyés toutes les 5 secondes
   - Évite les requêtes trop fréquentes

3. **Limitation du buffer** :
   - Maximum 200 logs en mémoire côté client
   - Maximum 80 logs affichés dans l'interface

4. **Pagination** :
   - Support de la pagination pour les grandes quantités de logs
   - Paramètres `limit` et `offset` pour contrôler la taille des réponses

### Métriques

- **Taille moyenne d'un log** : ~200 octets
- **Batch typique** : 10-20 logs (2-4 Ko)
- **Fréquence d'envoi** : Toutes les 5 secondes
- **Bande passante** : ~0.4-0.8 Ko/s par dispositif connecté

## Maintenance

### Nettoyage automatique

La fonction `cleanup_old_usb_logs()` est disponible pour nettoyer les vieux logs :

```sql
-- Supprimer manuellement les logs de plus de 7 jours
SELECT cleanup_old_usb_logs();
```

### Monitoring de la table

```sql
-- Compter le nombre total de logs
SELECT COUNT(*) FROM usb_logs;

-- Logs par dispositif
SELECT device_identifier, COUNT(*) as log_count 
FROM usb_logs 
GROUP BY device_identifier 
ORDER BY log_count DESC;

-- Taille de la table
SELECT pg_size_pretty(pg_total_relation_size('usb_logs'));

-- Logs des dernières 24h
SELECT COUNT(*) FROM usb_logs 
WHERE created_at > NOW() - INTERVAL '24 hours';
```

### Tâche CRON (optionnel)

Pour nettoyer automatiquement les vieux logs tous les jours :

```cron
# Nettoyer les logs USB tous les jours à 3h du matin
0 3 * * * psql -h localhost -U your_user -d your_database -c "SELECT cleanup_old_usb_logs();"
```

## Troubleshooting

### Les logs ne s'affichent pas

1. Vérifier que la migration a été exécutée :
   ```sql
   SELECT COUNT(*) FROM usb_logs;
   ```

2. Vérifier que les logs sont bien envoyés (console du navigateur) :
   ```
   ✅ X logs USB envoyés au serveur
   ```

3. Vérifier les permissions (doit être admin)

### Les logs ne sont pas envoyés automatiquement

1. Vérifier que le dispositif USB est bien connecté
2. Vérifier que le streaming est démarré
3. Vérifier la console du navigateur pour les erreurs
4. Vérifier que le token JWT est valide

### Erreur 403 (Forbidden)

Vous n'êtes pas administrateur. Seuls les utilisateurs avec le rôle `admin` peuvent accéder aux logs USB.

### Erreur 500 lors de l'envoi

Vérifier les logs du serveur PHP pour identifier le problème :
```bash
tail -f /var/log/apache2/error.log  # Apache
tail -f /var/log/nginx/error.log    # Nginx
```

## Migration depuis une version antérieure

Si vous utilisez déjà le système OTT, exécutez simplement la migration :

```bash
# Via le script
.\scripts\install_usb_logs.ps1

# Ou via l'API
curl -X POST http://localhost:3000/api.php/migrate \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d "file=migration_add_usb_logs.sql"
```

Aucune modification de code n'est nécessaire, la fonctionnalité est automatiquement activée.

## API Examples

### Envoyer des logs (POST)

```javascript
const response = await fetch('/api.php/usb-logs', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN'
  },
  body: JSON.stringify({
    device_identifier: '893330240012345678',
    device_name: 'USB-1234',
    logs: [
      {
        log_line: 'Device connected',
        log_source: 'dashboard',
        timestamp: Date.now()
      },
      {
        log_line: 'Streaming started',
        log_source: 'device',
        timestamp: Date.now()
      }
    ]
  })
});

const result = await response.json();
console.log(result.inserted_count); // 2
```

### Récupérer les logs (GET)

```javascript
// Tous les logs (100 max)
const response = await fetch('/api.php/usb-logs?limit=100', {
  headers: {
    'Authorization': 'Bearer YOUR_ADMIN_TOKEN'
  }
});

const result = await response.json();
console.log(result.logs); // Array de logs
console.log(result.total); // Nombre total de logs

// Logs d'un dispositif spécifique
const response = await fetch('/api.php/usb-logs/893330240012345678?limit=50', {
  headers: {
    'Authorization': 'Bearer YOUR_ADMIN_TOKEN'
  }
});

// Logs depuis un timestamp
const since = Date.now() - 3600000; // Dernière heure
const response = await fetch(`/api.php/usb-logs?since=${since}`, {
  headers: {
    'Authorization': 'Bearer YOUR_ADMIN_TOKEN'
  }
});
```

### Nettoyer les vieux logs (DELETE)

```javascript
const response = await fetch('/api.php/usb-logs/cleanup', {
  method: 'DELETE',
  headers: {
    'Authorization': 'Bearer YOUR_ADMIN_TOKEN'
  }
});

const result = await response.json();
console.log(`${result.deleted_count} logs supprimés`);
```

## Contribution

Pour contribuer à cette fonctionnalité :

1. **Modifier la rétention** : Éditer `sql/migration_add_usb_logs.sql` et changer `INTERVAL '7 days'`
2. **Modifier la fréquence d'envoi** : Éditer `contexts/UsbContext.js` et changer l'intervalle (défaut: 5000ms)
3. **Modifier la limite du batch** : Éditer `api/handlers/usb_logs.php` et changer la limite (défaut: 100)

## Licence

© 2024 HAPPLYZ MEDICAL SAS - Tous droits réservés

