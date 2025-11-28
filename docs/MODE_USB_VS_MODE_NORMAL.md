# Mode USB vs Mode Normal - Guide Complet

## 📋 Vue d'ensemble

Le firmware OTT fonctionne en **deux modes distincts** selon la détection USB au démarrage :

1. **Mode USB** : Mode interactif pour tests et diagnostics
2. **Mode Normal** : Mode autonome pour production

---

## 🔌 Mode USB (Streaming USB)

### Détection
- **Fenêtre de détection** : 3.5 secondes après le boot
- **Commande d'activation** : `usb` (ou `u`, `stream`, `usb_on`, `usb_stream_on`)
- **Si détecté** : Le firmware entre dans `usbStreamingLoop()` et **ne démarre PAS le modem**

### Comportement

#### ✅ Ce que le firmware fait :
- **Attend uniquement vos commandes** depuis l'interface dashboard
- **Ne démarre pas le modem** automatiquement (économie d'énergie)
- **N'envoie aucune mesure** automatiquement
- **Ne consomme pas de données réseau** (pas de connexion réseau)
- **Vérifie périodiquement** la connexion USB (toutes les 5 secondes)
- **Répond aux commandes** avec confirmations et mesures JSON

#### ❌ Ce que le firmware ne fait PAS :
- ❌ Pas d'initialisation du modem
- ❌ Pas d'envoi automatique de mesures
- ❌ Pas de connexion réseau
- ❌ Pas de deep sleep
- ❌ Pas de cycle automatique

### Commandes disponibles en mode USB

| Commande | Description | Réponse JSON |
|----------|-------------|--------------|
| `usb` | Active le mode USB (dans les 3.5s après boot) | - |
| `start` | Démarre le streaming continu (mesures automatiques) | ✅ Mesures JSON |
| `stop` | Arrête le streaming continu | - |
| `once` | Envoie une mesure complète immédiate | ✅ Mesure JSON complète |
| `modem_on` | Démarre le modem (nécessaire pour GPS/RSSI) | - |
| `modem_off` | Arrête le modem | - |
| `test_network` | Teste l'enregistrement réseau | ✅ Mesure JSON avec RSSI |
| `gps` | Teste le GPS et obtient la position | ✅ Mesure JSON avec GPS |
| `flowrate` | Demande uniquement le débit | ✅ Mesure JSON (débit + RSSI si modem démarré) |
| `battery` | Demande uniquement la batterie | ✅ Mesure JSON (batterie + RSSI si modem démarré) |
| `device_info` | Demande les infos du dispositif (ICCID, Serial, Firmware) | ✅ JSON device_info |
| `interval=<ms>` | Change l'intervalle de streaming (200-10000ms) | - |
| `help` | Affiche l'aide | - |
| `exit` | Quitte le mode USB et redémarre | - |

### Flux en mode USB

```
Boot → Détection USB (3.5s) → Mode USB activé
  ↓
usbStreamingLoop() {
  while (true) {
    - feedWatchdog()
    - Vérifier connexion USB (toutes les 5s)
    - Lire commandes Serial
    - Traiter commandes
    - Envoyer mesures SEULEMENT si streamingActive = true ET commande reçue
  }
}
```

### Cas d'usage Mode USB

1. **Tests et développement**
   - Tester les capteurs sans consommer de données
   - Déboguer le firmware en temps réel
   - Vérifier les mesures sans réseau

2. **Diagnostics**
   - Tester le modem et le GPS sur demande
   - Vérifier la qualité du signal (RSSI)
   - Obtenir les informations du dispositif

3. **Configuration**
   - Tester différentes configurations
   - Vérifier les calibrations
   - Valider les paramètres avant déploiement

---

## 📡 Mode Normal (Production)

### Détection
- **Si pas de commande `usb` dans les 3.5 secondes** : Le firmware continue en mode normal
- **Initialisation automatique** : Le modem est démarré automatiquement

### Comportement

#### ✅ Ce que le firmware fait :
- **Initialise le modem** automatiquement
- **Capture les mesures** (débit, batterie, RSSI)
- **Obtient la position GPS** (ou réseau cellulaire en fallback)
- **Envoie à l'API** via HTTPS
- **Récupère les commandes** en attente depuis l'API
- **Traite les commandes** (SET_SLEEP_SECONDS, UPDATE_CONFIG, etc.)
- **Entre en deep sleep** pour économiser l'énergie
- **Se réveille** après le délai configuré (par défaut 24h)

#### ❌ Ce que le firmware ne fait PAS :
- ❌ Pas d'attente de commandes USB
- ❌ Pas de streaming continu
- ❌ Pas de mode interactif

### Cycle complet en mode normal

```
Boot → Init Modem → Démarrage Modem
  ↓
Capture Mesures {
  - Débit d'air
  - Niveau batterie
  - RSSI (qualité signal)
}
  ↓
Géolocalisation {
  - GPS (priorité)
  - Réseau cellulaire (fallback)
}
  ↓
Envoi API {
  - POST /api.php/devices/measurements
  - JSON avec toutes les données
}
  ↓
Récupération Commandes {
  - GET /api.php/devices/commands
  - Traitement des commandes
}
  ↓
Arrêt Modem → Deep Sleep (24h par défaut)
  ↓
Réveil → Répète le cycle
```

### Paramètres configurables

- **Intervalle de sommeil** : Par défaut 1440 minutes (24 heures)
  - Configurable via commande `SET_SLEEP_SECONDS`
  - Objectif : Limiter les coûts réseau (1 envoi par jour)

### Cas d'usage Mode Normal

1. **Production**
   - Fonctionnement autonome
   - Envoi automatique des mesures
   - Surveillance continue

2. **Déploiement terrain**
   - Pas besoin de connexion USB
   - Fonctionne sur batterie
   - Communication via réseau 4G

---

## 🔄 Comparaison des Modes

| Caractéristique | Mode USB | Mode Normal |
|----------------|----------|-------------|
| **Détection** | Commande `usb` dans 3.5s | Pas de commande USB |
| **Modem** | ❌ Non démarré (sur demande) | ✅ Démarré automatiquement |
| **Mesures** | ❌ Sur commande uniquement | ✅ Automatiques à chaque réveil |
| **Réseau** | ❌ Pas de connexion | ✅ Connexion HTTPS automatique |
| **GPS** | ⚠️ Sur commande (modem requis) | ✅ Automatique |
| **Deep Sleep** | ❌ Non (boucle active) | ✅ Oui (24h par défaut) |
| **Consommation** | 🔋 Élevée (actif en continu) | 🔋 Faible (deep sleep) |
| **Coûts réseau** | 💰 Aucun | 💰 1 envoi/jour (configurable) |
| **Interactivité** | ✅ Complète (commandes temps réel) | ❌ Aucune |
| **Usage** | Tests, diagnostics, développement | Production, déploiement |

---

## 🎯 Cas d'Usage Recommandés

### Utiliser le Mode USB quand :
- ✅ Vous développez ou testez le firmware
- ✅ Vous voulez déboguer en temps réel
- ✅ Vous voulez tester sans consommer de données
- ✅ Vous voulez contrôler précisément les actions
- ✅ Vous voulez diagnostiquer un problème

### Utiliser le Mode Normal quand :
- ✅ Le dispositif est en production
- ✅ Vous voulez un fonctionnement autonome
- ✅ Vous voulez économiser l'énergie
- ✅ Vous voulez limiter les coûts réseau
- ✅ Le dispositif est déployé sur le terrain

---

## 🔧 Transition entre les Modes

### Mode USB → Mode Normal
- **Commande `exit`** : Quitte le mode USB et redémarre
- **Déconnexion USB** : Détectée automatiquement, redémarre en mode normal
- **Redémarrage** : Le firmware reprend le cycle normal

### Mode Normal → Mode USB
- **Connexion USB au boot** : Envoyer `usb` dans les 3.5 secondes
- **Dashboard** : Envoie automatiquement `usb` puis `start` après connexion

---

## 📊 Statistiques et Monitoring

### Mode USB
- **Mesures reçues** : Compteur en temps réel dans l'interface
- **Dernière mesure** : Timestamp de la dernière mesure reçue
- **État du modem** : Affiché en temps réel (arrêté/démarrage/démarré)
- **Position GPS** : Affichée si disponible après commande `gps`
- **RSSI** : Affiché après commande `test_network`

### Mode Normal
- **Dernière mesure** : Visible dans le dashboard (tableau dispositifs)
- **Statut** : "En ligne" si mesure récente (< 30 min)
- **Position** : Affichée sur la carte interactive
- **Historique** : Toutes les mesures stockées dans la base de données

---

## ⚠️ Points d'Attention

### Mode USB
- ⚠️ **Consommation batterie** : Le dispositif reste actif en continu
- ⚠️ **Watchdog** : Doit être nourri régulièrement (`feedWatchdog()`)
- ⚠️ **Modem** : Doit être démarré manuellement pour GPS/RSSI
- ⚠️ **Streaming** : Doit être activé avec `start` pour mesures automatiques

### Mode Normal
- ⚠️ **Délai de sommeil** : Par défaut 24h (configurable)
- ⚠️ **Coûts réseau** : 1 envoi par jour (limite les coûts)
- ⚠️ **Pas d'interactivité** : Pas de commandes USB possibles
- ⚠️ **Dépendance réseau** : Nécessite une couverture 4G

---

## 📚 Documentation Complémentaire

- [Architecture complète](./ARCHITECTURE.md)
- [Analyse du firmware](../ANALYSE_FIRMWARE.md)
- [Cycle du firmware](../ANALYSE_CYCLE_FIRMWARE.md)
- [Commandes USB disponibles](../scripts/test/ANALYSE_BOUTONS_INTERFACE.md)

