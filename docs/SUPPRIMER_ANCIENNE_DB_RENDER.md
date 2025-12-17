# 🗑️ Supprimer une base de données PostgreSQL sur Render

Ce guide vous explique comment supprimer une ancienne base de données PostgreSQL sur Render.

## ⚠️ ATTENTION

**La suppression d'une base de données est IRREVERSIBLE !**

- ❌ Toutes les données seront perdues définitivement
- ❌ Vous ne pourrez pas récupérer les données après suppression
- ✅ Assurez-vous d'avoir fait une sauvegarde si nécessaire

## 📋 Étapes pour supprimer

### 1. Accéder au dashboard Render

1. Allez sur https://dashboard.render.com
2. Connectez-vous avec votre compte

### 2. Accéder à la base de données

1. Dans le menu de gauche, cliquez sur **"Databases"**
2. Vous verrez la liste de toutes vos bases de données PostgreSQL
3. **Sélectionnez l'ancienne base de données** que vous voulez supprimer

### 3. Supprimer la base de données

1. Dans la page de la base de données, allez dans l'onglet **"Settings"** (ou cherchez le bouton de suppression)
2. Faites défiler jusqu'en bas de la page
3. Trouvez la section **"Danger Zone"** ou **"Delete Database"**
4. Cliquez sur **"Delete Database"** (ou **"Delete"**)
5. **Confirmez la suppression** en tapant le nom de la base de données (ex: `ott-database-old`)
6. Cliquez sur **"Confirm Delete"** (ou **"Delete"**)

### 4. Attendre la suppression

- La suppression peut prendre quelques minutes
- Vous verrez un message de confirmation une fois terminé

## 🔍 Vérification

1. Retournez dans **"Databases"**
2. L'ancienne base de données ne devrait plus apparaître dans la liste

## 📝 Note importante

Après avoir supprimé l'ancienne base de données :

- ✅ Vérifiez que votre service API utilise bien la nouvelle `DATABASE_URL`
- ✅ Vérifiez que tous les services qui utilisaient l'ancienne base sont mis à jour
- ✅ Testez que votre application fonctionne correctement avec la nouvelle base

## 🆘 Si vous avez besoin de récupérer des données

Si vous avez besoin de récupérer des données de l'ancienne base avant de la supprimer :

1. **Faites une sauvegarde** :
   ```powershell
   .\scripts\db\backup_data.ps1 -DatabaseUrl "postgresql://user:pass@host:port/dbname"
   ```

2. **Ou utilisez pg_dump** :
   ```bash
   pg_dump "postgresql://user:pass@host:port/dbname" > backup.sql
   ```

3. **Puis restaurez dans la nouvelle base** :
   ```powershell
   .\scripts\db\restore_data.ps1 -DatabaseUrl "postgresql://..." -BackupFile "backup.json"
   ```

