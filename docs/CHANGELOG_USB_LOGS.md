# Changelog - Monitoring USB à Distance

## [1.0.0] - 2024-12-03

### ✨ Ajouté

#### Base de données
- **Table `usb_logs`** : Stockage des logs USB avec colonnes :
  - `id` : Identifiant unique
  - `device_identifier` : Identifiant du dispositif (ICCID/Serial/Nom)
  - `device_name` : Nom du dispositif
  - `log_line` : Contenu du log
  - `log_source` : Source du log (`device` ou `dashboard`)
  - `user_id` : ID de l'utilisateur qui avait le dispositif connecté
  - `created_at` : Date de création du log

- **Index optimisés** :
  - `idx_usb_logs_device` : Sur `device_identifier`
  - `idx_usb_logs_created_at` : Sur `created_at DESC`
  - `idx_usb_logs_device_created` : Composite sur `(device_identifier, created_at DESC)`

- **Vue `usb_logs_view`** : Jointure avec `users` et `devices` pour faciliter les requêtes

- **Fonction `cleanup_old_usb_logs()`** : Suppression automatique des logs de plus de 7 jours

#### API Backend (PHP)

- **Handler `api/handlers/usb_logs.php`** avec fonctions :
  - `createUsbLogs()` : Enregistrer des logs (batch max 100)
  - `getUsbLogs()` : Récupérer tous les logs (avec filtres et pagination)
  - `getDeviceUsbLogs()` : Récupérer les logs d'un dispositif
  - `cleanupUsbLogs()` : Nettoyer les vieux logs (admin uniquement)
  - `handleUsbLogsRequest()` : Router principal

- **Endpoints API** :
  - `POST /api.php/usb-logs` : Enregistrer des logs (batch)
  - `GET /api.php/usb-logs` : Récupérer tous les logs
  - `GET /api.php/usb-logs/:device` : Logs d'un dispositif spécifique
  - `DELETE /api.php/usb-logs/cleanup` : Nettoyer les vieux logs

- **Paramètres de requête supportés** :
  - `device` : Filtrer par identifiant de dispositif
  - `source` : Filtrer par source (`device` ou `dashboard`)
  - `limit` : Nombre de logs (max 1000, défaut 100)
  - `offset` : Décalage pour pagination
  - `since` : Timestamp en ms (logs depuis cette date)

- **Validation et sécurité** :
  - Authentification JWT requise
  - Autorisation admin uniquement pour GET et DELETE
  - Limite de 100 logs par requête POST
  - Validation stricte de tous les paramètres

#### Frontend (React/Next.js)

- **Composant `components/UsbLogsViewer.js`** :
  - Affichage des logs avec filtres
  - Auto-refresh configurable (5 secondes par défaut)
  - Pagination avec limite configurable
  - Boutons d'actualisation et de nettoyage
  - Formatage des dates localisé (fr-FR)
  - Affichage coloré selon la source (device/dashboard)

- **Page `app/dashboard/admin/usb-logs/page.js`** :
  - Page d'administration dédiée
  - Informations et documentation intégrées
  - Accordéon avec détails techniques

- **Modification de `contexts/UsbContext.js`** :
  - Ajout de `logsToSendRef` pour buffer les logs
  - Ajout de `sendLogsTimerRef` pour le timer d'envoi
  - Modification de `appendUsbStreamLog()` pour collecter les logs
  - Nouvelle fonction `sendLogsToServer()` pour l'envoi batch
  - Timer automatique d'envoi toutes les 5 secondes
  - Limitation du buffer à 200 logs pour éviter surcharge mémoire

- **Modification de `components/Sidebar.js`** :
  - Ajout du lien "📡 Logs USB" dans le menu
  - Vérification des permissions (admin uniquement)

#### Scripts et outils

- **Script `scripts/install_usb_logs.ps1`** (PowerShell) :
  - Installation automatique de la migration
  - Parsing de la `DATABASE_URL` depuis `.env`
  - Exécution de la migration via `psql`
  - Gestion des erreurs et validation

#### Documentation

- **`docs/USB_LOGS_MONITORING.md`** : Documentation technique complète
  - Architecture détaillée
  - Guide d'installation
  - Exemples d'utilisation de l'API
  - Section troubleshooting
  - Métriques de performance
  - Instructions de maintenance

- **`docs/GUIDE_MONITORING_USB.md`** : Guide utilisateur simplifié
  - Instructions pour Maxim (admin)
  - Instructions pour utilisateurs locaux
  - Scénarios d'utilisation
  - FAQ

- **`FONCTIONNALITE_LOGS_USB.md`** : Document récapitulatif
  - Résumé de la fonctionnalité
  - Instructions d'installation
  - Liste des fichiers modifiés/créés
  - Exemples d'utilisation

#### Tests

- **`__tests__/api/usb_logs.test.js`** : Suite de tests Jest
  - Tests POST : Création de logs, validation, limites
  - Tests GET : Récupération, filtres, pagination
  - Tests DELETE : Nettoyage des logs
  - Tests d'authentification et autorisation
  - Tests de sécurité (non-admin, sans token)

#### Migration SQL

- **`sql/migration_add_usb_logs.sql`** : Script de migration complet
  - Création de la table `usb_logs`
  - Création des index
  - Création de la vue `usb_logs_view`
  - Création de la fonction `cleanup_old_usb_logs()`
  - Commentaires SQL pour documentation

### 🔧 Modifié

- **`api.php`** : Ajout du require pour `usb_logs.php` et du routage `/usb-logs`
- **`contexts/UsbContext.js`** : Ajout de l'envoi automatique des logs au serveur
- **`components/Sidebar.js`** : Ajout du menu "Logs USB" pour les admins

### 📊 Métriques

- **Lignes de code ajoutées** : ~2000 lignes
- **Fichiers créés** : 10
- **Fichiers modifiés** : 3
- **Endpoints API** : 4
- **Tests** : 15+ scénarios

### 🔒 Sécurité

- ✅ Authentification requise sur tous les endpoints
- ✅ Autorisation admin pour GET et DELETE
- ✅ Limite de 100 logs par requête POST
- ✅ Rétention de 7 jours maximum
- ✅ Validation stricte de tous les paramètres
- ✅ Protection contre les injections SQL (requêtes préparées)
- ✅ Pas de données sensibles dans les logs

### 📈 Performance

- **Fréquence d'envoi** : 5 secondes (configurable)
- **Batch size** : 10-20 logs en moyenne (~2-4 Ko)
- **Bande passante** : ~0.4-0.8 Ko/s par dispositif
- **Impact mémoire** : Négligeable (buffer de 200 logs max)
- **Impact CPU** : Minimal (envoi asynchrone)
- **Stockage DB** : ~200 octets par log

### 🎯 Bénéfices

- ✅ **Support à distance** : Diagnostic sans être physiquement présent
- ✅ **Gain de temps** : Plus besoin de demander les logs aux utilisateurs
- ✅ **Historique** : Conservation de 7 jours pour audit
- ✅ **Temps réel** : Logs visibles instantanément (5s de latence max)
- ✅ **Filtrage avancé** : Par dispositif, source, date
- ✅ **Transparence** : Automatique, aucune action utilisateur requise

### 🐛 Bugs connus

Aucun bug connu pour le moment.

### 🔮 Améliorations futures possibles

- [ ] Recherche full-text dans les logs
- [ ] Export des logs en CSV/JSON
- [ ] Alertes en temps réel sur certains patterns de logs
- [ ] Graphiques de fréquence des logs
- [ ] Support de WebSocket pour push temps réel (au lieu de polling)
- [ ] Compression des logs pour réduire la bande passante
- [ ] Configuration de la rétention par utilisateur/dispositif
- [ ] Dashboard avec statistiques des logs USB

### 📝 Notes de migration

Pour mettre à jour depuis une version sans cette fonctionnalité :

1. Exécuter `scripts/install_usb_logs.ps1` (Windows) ou la migration SQL manuellement
2. Aucune modification de configuration requise
3. La fonctionnalité s'active automatiquement
4. Aucun impact sur les fonctionnalités existantes

### 🙏 Remerciements

Cette fonctionnalité a été développée pour améliorer le support à distance et faciliter le diagnostic des problèmes USB.

---

## Format du Changelog

Ce changelog suit le format [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/)
et adhère au [Semantic Versioning](https://semver.org/lang/fr/).

### Types de changements

- **Ajouté** : Nouvelles fonctionnalités
- **Modifié** : Changements dans les fonctionnalités existantes
- **Déprécié** : Fonctionnalités bientôt supprimées
- **Supprimé** : Fonctionnalités supprimées
- **Corrigé** : Corrections de bugs
- **Sécurité** : Corrections de vulnérabilités

---

**© 2024 HAPPLYZ MEDICAL SAS**

