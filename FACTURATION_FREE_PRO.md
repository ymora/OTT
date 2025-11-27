# Facturation Free Pro pour IoT

## 📱 Forfait Free Pro

### Caractéristiques générales
- **Appels** : Illimités vers fixes et mobiles (France métropolitaine)
- **SMS/MMS** : Illimités
- **Données** : Forfait de données inclus (varie selon l'offre)
- **Facturation** : Forfait mensuel fixe

### ⚠️ Important pour les dispositifs IoT

**Les données cellulaires (GPRS/4G) sont facturées selon votre forfait :**

1. **Si vous avez un forfait avec données incluses** :
   - Les données sont décomptées de votre forfait
   - Pas de frais supplémentaires tant que vous ne dépassez pas
   - Au-delà du forfait : frais supplémentaires (généralement ~0.01€/MB)

2. **Les données IoT consomment votre forfait** :
   - Chaque connexion GPRS/4G consomme des données
   - Chaque POST HTTP consomme des données
   - Les données ne sont PAS "illimitées" comme les appels

### 💰 Estimation des coûts

#### Mode normal (toutes les 5 minutes)
- **1 mesure toutes les 5 minutes** = 12 mesures/heure = 288 mesures/jour
- **~1 KB par mesure** (JSON + overhead HTTP/HTTPS)
- **~288 KB/jour** = **~8.6 MB/mois**
- **Avec Free Pro** : Généralement inclus dans le forfait de base

#### Mode économique (1 fois par jour) - **RECOMMANDÉ**
- **1 mesure par jour** = 30 mesures/mois
- **~1 KB par mesure**
- **~30 KB/mois** = **~0.03 MB/mois**
- **Avec Free Pro** : Négligeable, toujours inclus

### 🎯 Recommandations

1. **Pour les tests** : Utiliser le mode USB streaming (0 coût)
2. **Pour la production** : 
   - Mode économique (1 fois/jour) : ~0.03 MB/mois ✅
   - Mode normal (toutes les 5 min) : ~8.6 MB/mois ⚠️
3. **Vérifier votre forfait** : 
   - Consulter votre espace client Free
   - Vérifier le volume de données inclus
   - Activer les alertes de consommation

### 📊 Comparaison

| Mode | Fréquence | Données/mois | Coût estimé |
|------|-----------|--------------|-------------|
| **USB Streaming** | Continu | 0 MB | ✅ Gratuit |
| **Économique** | 1x/jour | ~0.03 MB | ✅ Gratuit (inclus) |
| **Normal** | Toutes les 5 min | ~8.6 MB | ⚠️ Vérifier forfait |
| **Rapide** | Toutes les 1 min | ~43 MB | ⚠️ Risque dépassement |

### ⚠️ Attention

- **Les données ne sont PAS illimitées** comme les appels
- **Chaque connexion réseau consomme des données**
- **Vérifier régulièrement votre consommation** dans l'espace client Free
- **Activer les alertes** pour éviter les surprises

### ✅ Solution implémentée

Le firmware a été modifié pour :
- **Détecter la déconnexion USB** et reprendre le cycle normal
- **Envoyer les données 1 fois par jour** par défaut (1440 minutes)
- **Limiter les coûts** tout en gardant la fonctionnalité

