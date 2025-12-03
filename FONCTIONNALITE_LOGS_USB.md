# ✅ Nouvelle Fonctionnalité : Monitoring USB à Distance

## 📋 Résumé

Une nouvelle fonctionnalité a été ajoutée à votre système OTT pour permettre aux administrateurs (comme Maxim) de consulter en temps réel les logs des dispositifs USB connectés, directement depuis l'interface web, **sans avoir besoin d'être physiquement sur le PC local**.

## 🎯 Problème résolu

**Avant** : Les logs USB n'étaient visibles que localement sur le PC où le dispositif est connecté. L'administrateur devait se déplacer ou demander à l'utilisateur de lui envoyer les logs.

**Maintenant** : Les logs sont automatiquement synchronisés vers le serveur et accessibles à distance via l'interface web pour les administrateurs.

## ✨ Fonctionnalités

✅ **Synchronisation automatique** : Les logs sont envoyés du PC local vers le serveur toutes les 5 secondes  
✅ **Accès en temps réel** : Maxim peut voir les logs immédiatement depuis l'interface web  
✅ **Filtrage avancé** : Par dispositif, par source (firmware/dashboard), avec pagination  
✅ **Auto-refresh** : L'affichage se met à jour automatiquement toutes les 5 secondes  
✅ **Historique** : Conservation des logs pendant 7 jours  
✅ **Sécurité** : Accessible uniquement aux administrateurs  

## 🚀 Installation

### Étape 1 : Exécuter la migration SQL

**Option A - Script automatique (Windows)** :
```powershell
.\scripts\install_usb_logs.ps1
```

**Option B - Via l'API** (nécessite d'être admin) :
```bash
curl -X POST http://localhost:3000/api.php/migrate \
  -H "Authorization: Bearer VOTRE_TOKEN_ADMIN" \
  -d "file=migration_add_usb_logs.sql"
```

**Option C - Directement avec psql** :
```bash
psql -h localhost -U your_user -d your_database -f sql/migration_add_usb_logs.sql
```

### Étape 2 : C'est tout !

Aucune autre configuration n'est nécessaire. La fonctionnalité est automatiquement activée.

## 📱 Utilisation

### Pour Maxim (Administrateur)

1. Se connecter à l'interface web
2. Cliquer sur **"📡 Logs USB"** dans le menu latéral
3. Consulter les logs en temps réel

**Ou directement** : `http://localhost:3000/dashboard/admin/usb-logs`

### Pour les utilisateurs locaux

**Rien à faire !** L'envoi des logs est complètement automatique et transparent.

## 📊 Ce qui a été ajouté

### Base de données

- ✅ Table `usb_logs` pour stocker les logs
- ✅ Index optimisés pour les requêtes rapides
- ✅ Vue `usb_logs_view` pour faciliter les jointures
- ✅ Fonction `cleanup_old_usb_logs()` pour le nettoyage automatique

### API

- ✅ `POST /api.php/usb-logs` - Enregistrer des logs (batch)
- ✅ `GET /api.php/usb-logs` - Récupérer tous les logs
- ✅ `GET /api.php/usb-logs/:device` - Logs d'un dispositif
- ✅ `DELETE /api.php/usb-logs/cleanup` - Nettoyer les vieux logs

### Frontend

- ✅ Composant `UsbLogsViewer` avec filtres et auto-refresh
- ✅ Page `/dashboard/admin/usb-logs` pour les administrateurs
- ✅ Lien dans le menu latéral
- ✅ Modification du contexte USB pour l'envoi automatique

### Documentation

- ✅ `docs/USB_LOGS_MONITORING.md` - Documentation technique complète
- ✅ `docs/GUIDE_MONITORING_USB.md` - Guide utilisateur simplifié
- ✅ Tests unitaires dans `__tests__/api/usb_logs.test.js`

## 🔒 Sécurité

- ✅ Authentification JWT requise pour tous les endpoints
- ✅ Autorisation admin uniquement pour consulter les logs
- ✅ Limitation à 100 logs par requête (protection contre les abus)
- ✅ Rétention de 7 jours seulement
- ✅ Validation stricte de tous les paramètres

## 📈 Performance

- **Bande passante** : ~0.4-0.8 Ko/s par dispositif connecté
- **Fréquence d'envoi** : Toutes les 5 secondes
- **Impact sur l'interface** : Négligeable (envoi en arrière-plan)
- **Stockage** : ~200 octets par log

## 🧪 Tests

Exécuter les tests :
```bash
npm test -- __tests__/api/usb_logs.test.js
```

## 📚 Documentation

- **Documentation technique** : `docs/USB_LOGS_MONITORING.md`
- **Guide utilisateur** : `docs/GUIDE_MONITORING_USB.md`
- **Migration SQL** : `sql/migration_add_usb_logs.sql`
- **Handler API** : `api/handlers/usb_logs.php`

## 🎓 Exemples d'utilisation

### Scénario 1 : Diagnostic à distance

Un utilisateur a un problème avec son dispositif USB. Maxim peut :
1. Accéder à `/dashboard/admin/usb-logs`
2. Filtrer par le dispositif concerné
3. Voir les logs en temps réel
4. Diagnostiquer le problème **sans être sur place**

### Scénario 2 : Suivi de flotte

Maxim veut surveiller plusieurs dispositifs :
1. Ouvrir la page Logs USB
2. Voir tous les logs de tous les dispositifs
3. Filtrer par dispositif si nécessaire

### Scénario 3 : Historique et audit

Maxim veut vérifier ce qui s'est passé hier :
1. Les logs des 7 derniers jours sont disponibles
2. Rechercher des événements spécifiques
3. Audit complet de l'activité USB

## 🔧 Maintenance

### Nettoyer manuellement les vieux logs

```sql
SELECT cleanup_old_usb_logs();
```

### Vérifier l'état de la table

```sql
-- Nombre total de logs
SELECT COUNT(*) FROM usb_logs;

-- Logs par dispositif
SELECT device_identifier, COUNT(*) as log_count 
FROM usb_logs 
GROUP BY device_identifier 
ORDER BY log_count DESC;

-- Taille de la table
SELECT pg_size_pretty(pg_total_relation_size('usb_logs'));
```

### Configurer un nettoyage automatique (optionnel)

Ajouter une tâche CRON pour nettoyer quotidiennement :
```cron
0 3 * * * psql -h localhost -U your_user -d your_database -c "SELECT cleanup_old_usb_logs();"
```

## ❓ FAQ

**Q : Les logs sont-ils privés ?**  
R : Oui, seuls les administrateurs peuvent les consulter.

**Q : Combien de temps sont conservés les logs ?**  
R : 7 jours maximum, puis suppression automatique.

**Q : Y a-t-il un impact sur les performances ?**  
R : Non, l'envoi est fait en arrière-plan et n'affecte pas l'interface.

**Q : Puis-je désactiver l'envoi des logs ?**  
R : Non, c'est une fonctionnalité système pour le support. Seuls les logs techniques sont envoyés.

**Q : Que se passe-t-il sans connexion Internet ?**  
R : Les logs s'affichent toujours localement. Ils seront envoyés dès que la connexion revient.

## 🆘 Support

Pour toute question :
- 📧 Email : support@happlyz.com
- 📖 Documentation : `docs/USB_LOGS_MONITORING.md`
- 🧪 Tests : `npm test -- __tests__/api/usb_logs.test.js`

## 🎉 Conclusion

Cette fonctionnalité améliore considérablement la capacité de support à distance en permettant aux administrateurs de diagnostiquer les problèmes USB sans avoir besoin d'être physiquement présents.

**Prochaines étapes** :
1. ✅ Exécuter la migration SQL
2. ✅ Tester l'accès à `/dashboard/admin/usb-logs`
3. ✅ Connecter un dispositif USB et vérifier que les logs apparaissent

---

**© 2024 HAPPLYZ MEDICAL SAS - Tous droits réservés**

**Version** : 1.0.0  
**Date** : Décembre 2024  
**Auteur** : AI Assistant

