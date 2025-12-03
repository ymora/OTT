# 🎯 Guide Rapide - Monitoring USB à Distance

## Pour Maxim (Administrateur)

### Comment accéder aux logs USB ?

1. **Connectez-vous** à l'interface web avec votre compte administrateur
2. Dans le menu latéral, cliquez sur **"📡 Logs USB"**
3. Vous verrez immédiatement tous les logs des dispositifs USB connectés

### Que puis-je voir ?

✅ **Logs en temps réel** de tous les dispositifs USB connectés  
✅ **Source des logs** : Firmware (du dispositif) ou Dashboard (de l'interface web)  
✅ **Informations de débogage** pour diagnostiquer les problèmes  
✅ **Historique** des 7 derniers jours  

### Comment filtrer les logs ?

- **Par dispositif** : Sélectionnez un dispositif dans la liste déroulante
- **Par source** : Choisissez "Firmware" ou "Dashboard"
- **Nombre de logs** : 50, 100, 200, 500 ou 1000 logs

### Fonctionnalités

- ⚡ **Auto-refresh** : Les logs se mettent à jour automatiquement toutes les 5 secondes
- 🔄 **Actualiser** : Forcez l'actualisation manuelle
- 🗑️ **Nettoyer** : Supprimez tous les logs de plus de 7 jours

---

## Pour l'utilisateur local (sur PC)

### Que se passe-t-il automatiquement ?

Quand vous connectez un dispositif USB et démarrez le streaming :

1. ✅ Les logs s'affichent localement sur votre PC (comme avant)
2. ✅ **EN PLUS**, les logs sont automatiquement envoyés au serveur toutes les 5 secondes
3. ✅ Maxim peut les voir en temps réel depuis son interface web
4. ✅ **Aucune action requise de votre part !**

### Dois-je faire quelque chose de spécial ?

**Non !** Tout fonctionne automatiquement. Utilisez l'interface comme d'habitude.

### Où vont mes logs ?

- Les logs sont stockés sur le serveur pendant **7 jours maximum**
- Après 7 jours, ils sont **automatiquement supprimés**
- Seuls les **administrateurs** peuvent les consulter
- Vos logs locaux restent sur votre PC et ne sont pas affectés

### Et si je n'ai pas Internet ?

Pas de problème ! L'interface continue de fonctionner normalement :
- ✅ Vous voyez toujours vos logs localement
- ⚠️ Les logs ne seront simplement pas envoyés au serveur
- ✅ Dès que la connexion revient, l'envoi reprend automatiquement

---

## Exemples d'utilisation

### Scénario 1 : Diagnostic à distance

**Problème** : Un utilisateur rencontre un problème avec son dispositif USB

**Solution** :
1. L'utilisateur connecte le dispositif et démarre le streaming
2. Maxim se connecte à l'interface web
3. Maxim filtre les logs par dispositif concerné
4. Maxim voit les logs en temps réel et peut diagnostiquer le problème **sans avoir besoin d'être physiquement présent**

### Scénario 2 : Suivi de flotte

**Besoin** : Surveiller plusieurs dispositifs en même temps

**Solution** :
1. Plusieurs utilisateurs connectent leurs dispositifs USB
2. Maxim accède à la page "Logs USB"
3. Maxim voit tous les logs de tous les dispositifs
4. Maxim peut filtrer par dispositif pour voir les détails

### Scénario 3 : Historique et audit

**Besoin** : Vérifier ce qui s'est passé hier

**Solution** :
1. Maxim accède à la page "Logs USB"
2. Les logs des 7 derniers jours sont disponibles
3. Maxim peut rechercher des événements spécifiques
4. Parfait pour l'audit et le dépannage rétrospectif

---

## FAQ

### Q : Mes logs sont-ils privés ?
**R :** Seuls les administrateurs peuvent consulter les logs USB. Les autres utilisateurs ne peuvent pas y accéder.

### Q : Combien de temps sont conservés mes logs ?
**R :** 7 jours maximum. Après, ils sont automatiquement supprimés.

### Q : Puis-je désactiver l'envoi des logs ?
**R :** Non, c'est une fonctionnalité système pour le support et le diagnostic. Mais rassurez-vous, seuls les logs techniques sont envoyés (aucune donnée patient).

### Q : Y a-t-il un impact sur les performances ?
**R :** Non, l'envoi est fait en arrière-plan toutes les 5 secondes et ne ralentit pas l'interface.

### Q : Que faire en cas d'erreur ?
**R :** Contactez votre administrateur (Maxim). Les logs d'erreur sont automatiquement envoyés au serveur, ce qui facilite le diagnostic.

---

## Support

Pour toute question ou problème :
- 📧 Email : support@happlyz.com
- 📱 Téléphone : +33 (0)1 XX XX XX XX
- 💬 Chat : Disponible dans l'interface web

---

**© 2024 HAPPLYZ MEDICAL SAS**

