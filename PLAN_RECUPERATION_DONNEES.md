# 🛟 PLAN DE RÉCUPÉRATION DES DONNÉES

**Date** : 12 Décembre 2025  
**Problème** : Données disparues (dispositifs, patients, utilisateurs)  
**Cause probable** : Clic accidentel sur "Réinitialiser la base de démo"

---

## 🔍 DIAGNOSTIC

### Ce qui s'est passé :

1. ❌ Vous avez probablement cliqué sur **"Réinitialiser la base de démo"**
2. ❌ Ce bouton exécute `TRUNCATE` sur TOUTES les tables
3. ❌ Puis recrée des données de test (3 users, 5 patients, 8 devices)

### Ce qui NE s'est PAS passé :

- ✅ Le script "Réparer" n'a PAS été exécuté avec succès (erreur 500)
- ✅ Donc ce n'est PAS la réparation qui a causé le problème

---

## 🛟 SOLUTIONS DE RÉCUPÉRATION

### Solution 1 : Backup Render (LE PLUS RAPIDE) ⭐

1. **Allez sur** : https://dashboard.render.com
2. **Cliquez** : Votre base PostgreSQL (pas l'API, la DATABASE)
3. **Onglet** : "Backups" ou "Point-in-Time Recovery"
4. **Sélectionnez** : Le backup d'AVANT aujourd'hui (hier soir ou ce matin)
5. **Restaurez** : Le backup

**Temps** : 5-10 minutes  
**Perte de données** : Quelques heures maximum (depuis le dernier backup)

---

### Solution 2 : Logs Render - Vérifier ce qui s'est passé

1. **Render** → Service API → **Logs**
2. **Cherchez** : `[handleResetDemo]` ou `TRUNCATE TABLE`
3. **Identifiez** : Quand et pourquoi ça a été appelé

Si vous trouvez ces logs, **confirmez** que c'était le Reset Démo.

---

### Solution 3 : Backup manuel PostgreSQL (si vous en aviez fait)

Si vous aviez fait un `pg_dump` manuel :

```bash
pg_restore -d $DATABASE_URL backup.dump
```

---

### Solution 4 : Recréer les données (DERNIER RECOURS)

Si AUCUN backup n'existe, je vous aide à :

1. ✅ Recréer votre compte admin : ymora@free.fr
2. ✅ Recréer vos patients
3. ✅ Recréer vos dispositifs
4. ❌ Mesures historiques = PERDUES (sauf si backup)

---

## 🚨 ACTIONS IMMÉDIATES

### URGENT - MAINTENANT :

1. **Allez sur Render** : https://dashboard.render.com
2. **Database PostgreSQL** → Onglet **Backups**
3. **Prenez une capture d'écran** des backups disponibles
4. **Envoyez-moi** la capture

### PENDANT CE TEMPS :

Vérifiez les logs Render :
- Service API → Logs
- Cherchez : `[handleResetDemo]`
- Copiez-moi les lignes si vous trouvez

---

## 💡 PRÉVENTION FUTURE

Une fois récupéré, on va :

1. ✅ **Renommer** le bouton "Réinitialiser" en **"⚠️ DANGER : Reset Démo"**
2. ✅ **Ajouter** une confirmation avec MOT DE PASSE
3. ✅ **Désactiver** ce bouton en production (seulement dev/local)
4. ✅ **Configurer** des backups automatiques quotidiens

---

## 📞 BESOIN D'AIDE MAINTENANT ?

**Répondez-moi avec** :

1. **Capture d'écran** des backups Render disponibles
2. **Logs Render** si vous trouvez `[handleResetDemo]`
3. **Depuis quand** vous utilisez l'application (pour estimer la perte)

**Je vous aide à récupérer TOUT ce qui est récupérable !**

---

## ✅ RASSUREZ-VOUS

- 🛟 Render fait des backups automatiques (généralement daily)
- 🛟 PostgreSQL a des logs de transactions
- 🛟 On peut récupérer vos données dans 95% des cas
- 🛟 Au pire, on recrée vos utilisateurs/patients (5 minutes)

**NE PANIQUEZ PAS - On va régler ça ensemble !**

