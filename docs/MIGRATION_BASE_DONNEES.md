# 🔄 Migration Base de Données Render

## 📋 Migration `last_flowrate` et `last_rssi`

Cette migration ajoute deux colonnes à la table `devices` pour stocker les dernières valeurs de débit et RSSI.

### ✅ Colonnes ajoutées

- `last_flowrate` : Dernière valeur de débit enregistrée (L/min) - `NUMERIC(5,2)`
- `last_rssi` : Dernière valeur RSSI enregistrée (dBm) - `INT`

### 🚀 Application de la migration

#### Option 1 : Script PowerShell (Recommandé)

```powershell
# Récupérer DATABASE_URL depuis Render Dashboard
# Render > PostgreSQL > Connect > Internal Database URL

.\scripts\db\migrate_last_values.ps1 -DATABASE_URL "postgresql://..."
```

#### Option 2 : Commande SQL directe

```bash
# Avec psql
psql $DATABASE_URL -f sql/migration_add_last_values.sql

# Ou avec Docker
cat sql/migration_add_last_values.sql | docker run --rm -i postgres:15 psql $DATABASE_URL
```

#### Option 3 : Via Render Dashboard (SQL Editor)

1. Aller sur Render Dashboard > PostgreSQL
2. Cliquer sur "Connect" > "SQL Editor"
3. Copier-coller le contenu de `sql/migration_add_last_values.sql`
4. Exécuter

### 🔍 Vérification

Après la migration, vérifier que les colonnes existent :

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'devices' 
  AND column_name IN ('last_flowrate', 'last_rssi');
```

### ⚠️ Notes importantes

- **Migration idempotente** : La migration peut être exécutée plusieurs fois sans erreur (vérifie l'existence avant d'ajouter)
- **Pas de perte de données** : Les colonnes sont ajoutées avec `NULL` par défaut, les données existantes ne sont pas affectées
- **Mise à jour automatique** : L'API mettra automatiquement à jour ces colonnes lors de la réception de nouvelles mesures

### 📊 Impact sur l'API

Après la migration, l'API mettra automatiquement à jour :
- `last_flowrate` : Lors de la réception d'une mesure avec `flowrate > 0`
- `last_rssi` : Lors de la réception d'une mesure avec `rssi != -999`

Ces valeurs sont ensuite utilisées par le dashboard pour afficher les dernières données même sans connexion USB.

---

## 🔄 Récupération et Sauvegarde de la Base

### Sauvegarder la base (dump)

```bash
# Avec pg_dump
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Ou avec Docker
docker run --rm -e PGPASSWORD=... postgres:15 pg_dump -h ... -U ... -d ... > backup.sql
```

### Restaurer la base

```bash
# Avec psql
psql $DATABASE_URL < backup.sql

# Ou avec Docker
cat backup.sql | docker run --rm -i postgres:15 psql $DATABASE_URL
```

### ⚠️ Important

- **Render suspend les bases gratuites** après inactivité
- **Les données sont conservées** pendant 90 jours
- **Réactiver** : Render Dashboard > PostgreSQL > Resume
- **Après réactivation** : Appliquer les migrations manquantes

---

## 📝 Historique des Migrations

| Migration | Fichier | Description |
|-----------|---------|-------------|
| `migration_add_last_values.sql` | `sql/migration_add_last_values.sql` | Ajoute `last_flowrate` et `last_rssi` à `devices` |

