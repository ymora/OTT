# Cas d'Usage Complets - OTT v3.6

## 📋 Vue d'ensemble

Ce document récapitule **tous les cas d'usage** couverts par l'application OTT v3.6, garantissant que tous les besoins sont satisfaits.

---

## 🔌 Cas d'Usage : Mode USB (Tests/Diagnostics)

### 1. Connexion et Détection USB
**Besoin** : Connecter un dispositif via USB pour tests/diagnostics
**Solution** :
- ✅ Détection automatique du port USB (Web Serial API)
- ✅ Sélection automatique du port connecté
- ✅ Envoi automatique de `usb` puis `start` après connexion
- ✅ Affichage des informations du dispositif (ICCID, Serial, Firmware)

**Interface** : Bouton 🔌 Connexion USB dans l'onglet "Streaming USB"

### 2. Streaming Continu
**Besoin** : Recevoir des mesures en continu pour tests
**Solution** :
- ✅ Commande `start` démarre le streaming continu
- ✅ Mesures automatiques à l'intervalle configuré (défaut 1000ms)
- ✅ Affichage en temps réel dans l'interface
- ✅ Mise à jour automatique des min/max

**Interface** : Bouton ▶️ Streaming (démarre/pause/arrête)

### 3. Mesure Unique
**Besoin** : Obtenir une mesure complète immédiate
**Solution** :
- ✅ Commande `once` envoie une mesure complète (débit + batterie + RSSI + GPS si disponible)
- ✅ Affichage immédiat dans l'interface
- ✅ Mise à jour de la base de données en arrière-plan

**Interface** : Bouton 📊 Mesure complète dans la section Statistiques

### 4. Test du Modem
**Besoin** : Tester le démarrage/arrêt du modem
**Solution** :
- ✅ Commande `modem_on` démarre le modem avec logs détaillés
- ✅ Commande `modem_off` arrête le modem
- ✅ Affichage de l'état en temps réel (arrêté/démarrage/démarré)

**Interface** : Bouton 📡 Modem (toggle on/off)

### 5. Test du Réseau et RSSI
**Besoin** : Tester l'enregistrement réseau et obtenir le RSSI
**Solution** :
- ✅ Commande `test_network` teste l'enregistrement réseau
- ✅ Envoie une mesure JSON avec le RSSI après le test
- ✅ Affichage du RSSI dans l'interface avec code couleur (vert/jaune/rouge)

**Interface** : Bouton 📶 RSSI (démarre modem si nécessaire puis teste)

### 6. Test GPS
**Besoin** : Tester le GPS et obtenir la position
**Solution** :
- ✅ Commande `gps` teste le GPS (modem requis)
- ✅ Envoie une mesure JSON avec la position GPS après le test
- ✅ Affichage de la position dans l'interface

**Interface** : Bouton 📍 GPS (nécessite modem démarré)

### 7. Mesure Débit Uniquement
**Besoin** : Obtenir uniquement la mesure de débit
**Solution** :
- ✅ Commande `flowrate` envoie une mesure avec débit + RSSI (si modem démarré)
- ✅ Affichage immédiat dans l'interface

**Interface** : Bouton 💨 Débit

### 8. Mesure Batterie Uniquement
**Besoin** : Obtenir uniquement la mesure de batterie
**Solution** :
- ✅ Commande `battery` envoie une mesure avec batterie + RSSI (si modem démarré)
- ✅ Affichage immédiat avec code couleur (vert/jaune/rouge selon niveau)

**Interface** : Bouton 🔋 Batterie

### 9. Informations du Dispositif
**Besoin** : Obtenir les informations du dispositif (ICCID, Serial, Firmware)
**Solution** :
- ✅ Commande `device_info` envoie toutes les informations
- ✅ Mise à jour automatique de l'interface et de la base de données

**Interface** : Boutons 🆔 Identifiant et 💾 Firmware

### 10. Configuration de l'Intervalle
**Besoin** : Changer l'intervalle de streaming
**Solution** :
- ✅ Commande `interval=<ms>` change l'intervalle (200-10000ms)
- ✅ Validation automatique des limites

**Interface** : Commande texte dans la console

### 11. Déconnexion USB
**Besoin** : Déconnecter proprement le dispositif USB
**Solution** :
- ✅ Détection automatique de la déconnexion USB
- ✅ Redémarrage automatique en mode normal
- ✅ Nettoyage des ressources

**Interface** : Bouton 🔌 Connexion USB (toggle connecté/déconnecté)

---

## 📡 Cas d'Usage : Mode Normal (Production)

### 12. Fonctionnement Autonome
**Besoin** : Le dispositif fonctionne de manière autonome sans intervention
**Solution** :
- ✅ Cycle automatique toutes les 24h (configurable)
- ✅ Capture automatique des mesures
- ✅ Envoi automatique à l'API
- ✅ Deep sleep entre les cycles

**Configuration** : Par défaut 1440 minutes (24h), configurable via commande `SET_SLEEP_SECONDS`

### 13. Envoi Automatique des Mesures
**Besoin** : Les mesures sont envoyées automatiquement à l'API
**Solution** :
- ✅ Capture automatique (débit, batterie, RSSI)
- ✅ Géolocalisation automatique (GPS priorité, réseau fallback)
- ✅ Envoi HTTPS sécurisé avec JWT
- ✅ Stockage dans la base de données

**Endpoint** : `POST /api.php/devices/measurements`

### 14. Récupération des Commandes
**Besoin** : Le dispositif récupère et traite les commandes en attente
**Solution** :
- ✅ Récupération automatique des commandes depuis l'API
- ✅ Traitement des commandes (SET_SLEEP_SECONDS, UPDATE_CONFIG, etc.)
- ✅ Accusé de réception automatique

**Endpoint** : `GET /api.php/devices/commands/pending`

### 15. Économie d'Énergie
**Besoin** : Limiter la consommation d'énergie
**Solution** :
- ✅ Deep sleep entre les cycles
- ✅ Modem arrêté entre les cycles
- ✅ Watchdog pour éviter les blocages

**Résultat** : Autonomie maximale sur batterie

### 16. Limitation des Coûts Réseau
**Besoin** : Limiter les coûts de transmission réseau
**Solution** :
- ✅ 1 envoi par jour par défaut (24h)
- ✅ Configurable via commande `SET_SLEEP_SECONDS`
- ✅ Pas de connexion inutile

**Résultat** : Coûts minimaux avec forfait Free Pro

---

## 🔄 Cas d'Usage : Transitions

### 17. Mode USB → Mode Normal
**Besoin** : Quitter le mode USB et reprendre le cycle normal
**Solution** :
- ✅ Commande `exit` quitte le mode USB et redémarre
- ✅ Détection automatique de déconnexion USB
- ✅ Redémarrage automatique en mode normal

**Interface** : Commande `exit` ou déconnexion USB

### 18. Mode Normal → Mode USB
**Besoin** : Passer en mode USB pour tests
**Solution** :
- ✅ Connexion USB au boot
- ✅ Envoi de `usb` dans les 3.5 secondes
- ✅ Entrée automatique en mode USB

**Interface** : Dashboard envoie automatiquement `usb` puis `start`

---

## 📊 Cas d'Usage : Affichage et Monitoring

### 19. Affichage Temps Réel
**Besoin** : Voir les mesures en temps réel
**Solution** :
- ✅ Mise à jour automatique de l'interface
- ✅ Compteur de mesures reçues
- ✅ Timestamp de dernière mesure
- ✅ Min/Max automatiques

**Interface** : Section "Mesures" et "Statistiques"

### 20. Historique des Mesures
**Besoin** : Consulter l'historique des mesures
**Solution** :
- ✅ Stockage dans la base de données
- ✅ Affichage dans le dashboard
- ✅ Graphiques et statistiques

**Interface** : Page "Dispositifs" → Détails → Graphiques

### 21. Géolocalisation
**Besoin** : Voir la position des dispositifs
**Solution** :
- ✅ Position GPS/réseau dans chaque mesure
- ✅ Affichage sur carte interactive
- ✅ Mise à jour automatique

**Interface** : Page "Carte" (`/dashboard/map`)

### 22. Alertes et Notifications
**Besoin** : Être alerté des problèmes
**Solution** :
- ✅ Détection automatique des alertes (batterie faible, débit anormal, etc.)
- ✅ Notifications dans le dashboard
- ✅ Historique des alertes

**Interface** : Page "Alertes" (`/dashboard/alerts`)

---

## 🔧 Cas d'Usage : Configuration et Maintenance

### 23. Configuration Distante
**Besoin** : Configurer le dispositif à distance
**Solution** :
- ✅ Commande `UPDATE_CONFIG` pour APN, JWT, ICCID, etc.
- ✅ Stockage en NVS (non-volatile)
- ✅ Application au prochain réveil

**Interface** : Page "Configuration" (`/dashboard/configuration`)

### 24. Mise à Jour OTA
**Besoin** : Mettre à jour le firmware à distance
**Solution** :
- ✅ Commande `OTA_REQUEST` déclenche la mise à jour
- ✅ Vérification MD5
- ✅ Rollback possible en cas d'échec

**Interface** : Page "OTA" (`/dashboard/ota`)

### 25. Calibration
**Besoin** : Calibrer le capteur de débit
**Solution** :
- ✅ Commande `UPDATE_CALIBRATION` avec nouveaux coefficients
- ✅ Application immédiate
- ✅ Stockage en NVS

**Interface** : Page "Configuration" → Calibration

---

## ✅ Vérification Complète

### Tous les cas d'usage sont couverts :

- ✅ **Mode USB** : 11 cas d'usage couverts
- ✅ **Mode Normal** : 5 cas d'usage couverts
- ✅ **Transitions** : 2 cas d'usage couverts
- ✅ **Affichage** : 4 cas d'usage couverts
- ✅ **Configuration** : 3 cas d'usage couverts

**Total : 25 cas d'usage couverts**

### Toutes les commandes sont fonctionnelles :

- ✅ `usb`, `start`, `stop`, `once`
- ✅ `modem_on`, `modem_off`
- ✅ `test_network`, `gps`
- ✅ `flowrate`, `battery`
- ✅ `device_info`
- ✅ `interval=<ms>`, `help`, `exit`

### Toutes les fonctionnalités sont documentées :

- ✅ README.md mis à jour
- ✅ ARCHITECTURE.md mis à jour
- ✅ MODE_USB_VS_MODE_NORMAL.md créé
- ✅ CAS_USAGE_COMPLETS.md créé (ce document)

---

## 📚 Documentation Complémentaire

- [Mode USB vs Mode Normal](./MODE_USB_VS_MODE_NORMAL.md)
- [Architecture complète](./ARCHITECTURE.md)
- [Analyse du firmware](../ANALYSE_FIRMWARE.md)
- [Cycle du firmware](../ANALYSE_CYCLE_FIRMWARE.md)
- [Commandes USB](../scripts/test/ANALYSE_BOUTONS_INTERFACE.md)

