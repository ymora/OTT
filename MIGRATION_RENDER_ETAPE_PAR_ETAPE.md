# 🚀 MIGRATION RENDER - GUIDE ÉTAPE PAR ÉTAPE

## ✅ Votre DATABASE_URL est prête !

**Base de données :** `dpg-d4b6c015pdvs73ck6rp0-a.frankfurt-postgres.render.com`  
**Base :** `ott_data`

---

## 📋 MÉTHODE RAPIDE (2 minutes)

### Étape 1 : Ouvrir le Shell Render

1. Allez sur : **https://dashboard.render.com/**
2. Connectez-vous
3. Trouvez votre **base PostgreSQL** dans la liste
4. Cliquez dessus
5. Cliquez sur l'onglet **"Shell"** en haut

### Étape 2 : Se connecter à PostgreSQL

Dans le terminal qui s'ouvre, tapez exactement :

```bash
psql $DATABASE_URL
```

Appuyez sur **Entrée**. Vous devriez voir :

```
ott_data=>
```

### Étape 3 : Copier/Coller la migration

1. **Ouvrez ce fichier** dans votre éditeur : `sql/MIGRATION_COMPLETE_PRODUCTION.sql`
2. **Sélectionnez TOUT** : `Ctrl+A`
3. **Copiez** : `Ctrl+C`
4. **Revenez au terminal Render**
5. **Collez** : Clic droit dans le terminal > Paste (ou `Ctrl+V`)
6. **Appuyez sur Entrée**

⏳ **Attendez 10-30 secondes** pendant que la migration s'exécute.

### Étape 4 : Vérifier le succès

À la fin, vous devriez voir :

```
 status          | users_actifs | patients_actifs | devices_actifs | configs_gps_ready | usb_logs_count
-----------------+--------------+-----------------+----------------+-------------------+---------------
 MIGRATION COMPLÈTE |          X |             X |            X |                 X |            X
```

✅ **Si vous voyez ce tableau, c'est réussi !**

---

## 🧪 Après la migration : TESTER

1. Retournez sur : **https://ymora.github.io/OTT/**
2. Allez dans "Dispositifs"
3. Essayez de créer ou modifier un dispositif
4. ✅ L'erreur "Database error" devrait avoir disparu !

---

## ⚠️ IMPORTANT

Une fois le problème résolu, **DÉSACTIVEZ le mode DEBUG** dans `api.php` :

Ouvrez `api.php` et supprimez ou commentez cette ligne :

```php
// putenv('DEBUG_ERRORS=true');  // À supprimer en production
```

---

## 📄 Fichier SQL complet

Le fichier à copier/coller est dans :  
**`sql/MIGRATION_COMPLETE_PRODUCTION.sql`**

Il fait environ 228 lignes et contient toutes les migrations nécessaires.

---

## 🆘 Si vous voyez une erreur

### "column already exists"
✅ **C'est normal !** Le script utilise `IF NOT EXISTS`, il peut être rejoué.

### "permission denied"
❌ Vérifiez que vous êtes connecté avec le bon utilisateur.

### "could not connect"
❌ Vérifiez que le Shell Render est bien ouvert et que vous avez tapé `psql $DATABASE_URL`.

---

## ✅ Checklist

- [ ] Shell Render ouvert
- [ ] Connecté avec `psql $DATABASE_URL`
- [ ] Fichier SQL copié (tout le contenu)
- [ ] Migration collée dans le terminal
- [ ] Tableau de vérification affiché
- [ ] Application testée
- [ ] Mode DEBUG désactivé

---

**Temps estimé** : 2 minutes ⚡  
**Difficulté** : ⭐ Facile (copier/coller)

🚀 **Allez-y, c'est très simple !**

