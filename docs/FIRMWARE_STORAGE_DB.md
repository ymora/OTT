# 💾 Stockage des Firmwares dans PostgreSQL (Alternative au Persistent Disk)

## 📋 Vue d'ensemble

Alternative au Persistent Disk pour les fichiers `.ino` et `.bin` compilés. Les fichiers sont stockés directement dans PostgreSQL en BYTEA, ce qui évite la perte de fichiers lors des redéploiements sur Render.com.

## ✅ Avantages

- ✅ **Pas de perte de fichiers** lors des redéploiements
- ✅ **Pas besoin de Persistent Disk** pour les firmwares
- ✅ **Backup automatique** inclus dans les backups PostgreSQL
- ✅ **Simple et fiable** - PostgreSQL gère le stockage
- ✅ **Compatibilité** - Fallback sur système de fichiers si BYTEA vide

## ⚠️ Limitations

- ⚠️ **Taille maximale** : ~1GB par fichier (limite PostgreSQL BYTEA)
- ⚠️ **Performance** : Légèrement plus lent que le système de fichiers pour les très gros fichiers
- ⚠️ **Base de données** : Augmente la taille de la base (mais les .ino et .bin sont généralement < 1MB chacun)

## 🔧 Migration

### ✅ Migration déjà appliquée

La migration a été appliquée automatiquement via l'endpoint API `/api.php/migrate/firmware-blob`.

Les colonnes `ino_content` et `bin_content` existent maintenant dans la table `firmware_versions`.

### Pour appliquer manuellement (si nécessaire)

```bash
psql $DATABASE_URL -f sql/migration_firmware_blob.sql
```

Ou via l'endpoint API (admin uniquement) :
```bash
POST /api.php/migrate/firmware-blob
Authorization: Bearer <token_admin>
```

### 2. Vérifier la migration

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'firmware_versions' 
AND column_name IN ('ino_content', 'bin_content');
```

## 📊 Structure

La table `firmware_versions` contient maintenant :

- `ino_content BYTEA` - Contenu du fichier .ino (optionnel)
- `bin_content BYTEA` - Contenu du fichier .bin compilé (optionnel)
- `file_path VARCHAR(255)` - Chemin historique (conservé pour compatibilité)

## 🔄 Fonctionnement

### Upload .ino

1. Fichier uploadé → lu en mémoire
2. Contenu stocké dans `ino_content` (BYTEA)
3. `file_path` conservé pour compatibilité (peut être NULL)
4. Système de fichiers utilisé comme fallback si BYTEA vide

### Compilation

1. `.ino` lu depuis `ino_content` (ou système de fichiers si vide)
2. Compilation avec `arduino-cli`
3. `.bin` compilé stocké dans `bin_content` (BYTEA)
4. `file_path` mis à jour pour compatibilité

### Téléchargement

1. Lecture depuis `bin_content` (priorité)
2. Fallback sur `file_path` si BYTEA vide
3. Envoi du fichier au client

## 🔍 Vérification

### Vérifier qu'un firmware est stocké en DB

```sql
SELECT 
    id, 
    version, 
    file_path,
    CASE WHEN ino_content IS NOT NULL THEN 'OUI' ELSE 'NON' END as ino_in_db,
    CASE WHEN bin_content IS NOT NULL THEN 'OUI' ELSE 'NON' END as bin_in_db,
    pg_size_pretty(pg_column_size(ino_content)) as ino_size,
    pg_size_pretty(pg_column_size(bin_content)) as bin_size
FROM firmware_versions
ORDER BY created_at DESC;
```

### Taille totale des firmwares en DB

```sql
SELECT 
    pg_size_pretty(SUM(pg_column_size(ino_content) + pg_column_size(bin_content))) as total_size
FROM firmware_versions
WHERE ino_content IS NOT NULL OR bin_content IS NOT NULL;
```

## 🚀 Migration des firmwares existants

Pour migrer les firmwares existants du système de fichiers vers la DB :

```sql
-- Mettre à jour les firmwares existants avec leur contenu
UPDATE firmware_versions fv
SET ino_content = (
    SELECT pg_read_binary_file('/opt/render/project/src/' || fv.file_path)
    WHERE file_exists('/opt/render/project/src/' || fv.file_path)
)
WHERE ino_content IS NULL 
AND file_path IS NOT NULL;
```

**Note** : Cette migration nécessite que les fichiers existent encore sur le serveur.

## 📝 Notes

- Les fichiers `.ino` et `.bin` sont généralement petits (< 1MB chacun)
- PostgreSQL gère efficacement les BYTEA jusqu'à ~1GB
- Le fallback sur système de fichiers assure la compatibilité avec les anciens firmwares
- Les nouveaux uploads utilisent automatiquement le stockage DB

