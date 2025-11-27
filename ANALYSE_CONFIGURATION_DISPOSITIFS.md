# Analyse : Configuration des Dispositifs

## Date : 2025-01-27

## Situation Actuelle

### 🔍 Comment ça fonctionne actuellement ?

#### 1. **Onglet Configuration** (`DeviceConfigurationTab.js`)
- **Endpoint** : `PUT /api.php/devices/{id}/config`
- **Action** : Met à jour **uniquement la base de données**
- **Paramètres modifiables** :
  - `sleep_minutes` : Intervalle de réveil (minutes)
  - `measurement_duration_ms` : Durée de mesure (ms)
  - `send_every_n_wakeups` : Envoi toutes les N réveils
  - `calibration_coefficients` : Coefficients de calibration [a0, a1, a2]

**⚠️ PROBLÈME** : Les modifications sont **uniquement dans la DB**. Le dispositif ne reçoit pas ces changements automatiquement.

#### 2. **Système de Commandes** (`devices/page.js` et `commands/page.js`)
- **Commande** : `UPDATE_CONFIG`
- **Action** : Crée une **commande OTA** qui sera envoyée au dispositif lors de sa prochaine connexion
- **Paramètres modifiables** (beaucoup plus nombreux) :
  - Configuration réseau : `apn`, `jwt`, `iccid`, `serial`, `sim_pin`
  - Configuration sommeil : `sleep_minutes_default`
  - Configuration mesure : `airflow_passes`, `airflow_samples_per_pass`, `airflow_delay_ms`
  - Configuration modem : `watchdog_seconds`, `modem_boot_timeout_ms`, `sim_ready_timeout_ms`, `network_attach_timeout_ms`, `modem_max_reboots`
  - Configuration OTA : `ota_primary_url`, `ota_fallback_url`, `ota_md5`
  - Calibration : `calA0`, `calA1`, `calA2`

**✅ AVANTAGE** : Les commandes sont envoyées au dispositif via OTA

**⚠️ PROBLÈME** : Interface complexe, beaucoup de champs, pas de vérification de disponibilité

### 🔄 Flux Actuel

#### Onglet Configuration :
```
Utilisateur modifie → Sauvegarde → DB mise à jour → ❌ Dispositif non informé
```

#### Système de Commandes :
```
Utilisateur crée commande → Commande en DB → Dispositif se connecte → Reçoit commande → Applique config
```

## Questions et Réponses

### ❓ Que se passe-t-il quand on change des données dans l'onglet Configuration ?

**Réponse** : Les données sont **uniquement sauvegardées dans la base de données**. Le dispositif **n'est pas informé** de ces changements. Il continuera à utiliser ses paramètres actuels jusqu'à ce qu'une commande `UPDATE_CONFIG` soit envoyée.

### ❓ Est-ce que ça reprogramme en OTA ou USB ?

**Réponse** : 
- **Onglet Configuration** : ❌ Non, juste mise à jour DB
- **Système de Commandes** : ✅ Oui, envoi OTA (pas USB)

### ❓ Est-ce que ça vérifie que le dispositif est accessible ?

**Réponse** : ❌ **Non**. Aucune vérification n'est faite :
- Pas de vérification si le dispositif est en ligne
- Pas de vérification si le dispositif peut recevoir des commandes
- Pas de vérification de la version du firmware

### ❓ Est-ce que ça met à jour la DB et attend la connexion ?

**Réponse** : 
- **Onglet Configuration** : ✅ Met à jour DB, mais **n'attend pas** la connexion
- **Système de Commandes** : ✅ Met à jour DB (commande), et **attend** la connexion pour l'envoi

### ❓ Le firmware gère-t-il tout ce qui est modifiable ?

**Réponse** : 
- **Onglet Configuration** : Les 4 paramètres sont gérés par le firmware ✅
- **Système de Commandes** : Tous les paramètres sont gérés par le firmware ✅

### ❓ Comment le firmware gère ça ?

**Réponse** : Le firmware :
1. Se connecte périodiquement au serveur (OTA)
2. Vérifie s'il y a des commandes en attente
3. Reçoit la commande `UPDATE_CONFIG` avec les paramètres
4. Applique les nouveaux paramètres
5. Confirme l'exécution de la commande

## Problèmes Identifiés

### 🚨 Problèmes Majeurs

1. **Incohérence** : Deux systèmes différents pour la même chose
2. **Manque de clarté** : L'utilisateur ne sait pas que l'onglet Configuration ne met pas à jour le dispositif
3. **Pas de vérification** : Aucune vérification de disponibilité du dispositif
4. **Interface confuse** : Beaucoup de champs dans les commandes, peu dans l'onglet Configuration
5. **Pas de feedback** : L'utilisateur ne sait pas quand le dispositif appliquera les changements

### ⚠️ Problèmes Mineurs

1. **Paramètres limités** : L'onglet Configuration n'a que 4 paramètres vs beaucoup plus dans les commandes
2. **Pas de mode USB** : Pas de possibilité de configurer via USB
3. **Pas de prévisualisation** : Pas de comparaison avant/après
4. **Pas d'historique** : Pas de suivi des changements de configuration

## Recommandations

### 🎯 Solution Recommandée : Approche Hybride

#### Option 1 : **Unifier les deux systèmes** (Recommandé)

**Principe** :
1. L'onglet Configuration devient l'interface principale
2. Lors de la sauvegarde :
   - ✅ Met à jour la DB (comme actuellement)
   - ✅ Crée automatiquement une commande `UPDATE_CONFIG` OTA
   - ✅ Vérifie si le dispositif est accessible (optionnel)
   - ✅ Affiche un message clair sur le statut

**Avantages** :
- ✅ Interface simple et claire
- ✅ L'utilisateur comprend ce qui se passe
- ✅ Automatisation complète
- ✅ Cohérence entre DB et dispositif

**Implémentation** :
```javascript
const handleSave = async (e) => {
  // 1. Sauvegarder dans la DB
  await updateDeviceConfig(deviceId, config)
  
  // 2. Créer une commande OTA automatiquement
  await createCommand({
    device_id: deviceId,
    command: 'UPDATE_CONFIG',
    payload: {
      sleep_minutes_default: config.sleep_minutes,
      measurement_duration_ms: config.measurement_duration_ms,
      send_every_n_wakeups: config.send_every_n_wakeups,
      calA0: config.calibration_coefficients[0],
      calA1: config.calibration_coefficients[1],
      calA2: config.calibration_coefficients[2]
    },
    priority: 'normal'
  })
  
  // 3. Afficher message informatif
  setSuccess('Configuration sauvegardée. Le dispositif sera mis à jour lors de sa prochaine connexion.')
}
```

#### Option 2 : **Améliorer l'onglet Configuration avec choix de méthode**

**Principe** :
- Ajouter un choix : "Méthode de mise à jour"
  - 📡 OTA (recommandé) : Crée une commande, appliquée à la prochaine connexion
  - 🔌 USB : Si connecté, envoie directement via USB
  - 💾 Base de données uniquement : Sauvegarde pour référence future

**Avantages** :
- ✅ Flexibilité maximale
- ✅ Contrôle utilisateur
- ✅ Support USB

#### Option 3 : **Garder séparé mais améliorer la clarté**

**Principe** :
- Améliorer les messages et l'interface
- Ajouter des indicateurs visuels
- Documenter clairement chaque méthode

**Avantages** :
- ✅ Pas de changement majeur
- ✅ Amélioration progressive

### 🔧 Améliorations Spécifiques

#### 1. **Vérification de Disponibilité**

```javascript
// Vérifier si le dispositif est en ligne
const checkDeviceAvailability = async (deviceId) => {
  const device = await getDevice(deviceId)
  const lastSeen = new Date(device.last_seen)
  const now = new Date()
  const minutesSinceLastSeen = (now - lastSeen) / 1000 / 60
  
  if (minutesSinceLastSeen < 5) {
    return { available: true, method: 'online', message: 'Dispositif en ligne' }
  } else if (minutesSinceLastSeen < 60) {
    return { available: true, method: 'recent', message: 'Vu récemment, mise à jour à la prochaine connexion' }
  } else {
    return { available: false, method: 'offline', message: 'Dispositif hors ligne, mise à jour en attente' }
  }
}
```

#### 2. **Amélioration de l'Interface**

- ✅ Ajouter des badges de statut (En ligne / Hors ligne / En attente)
- ✅ Afficher la dernière fois que le dispositif a été vu
- ✅ Afficher le nombre de commandes en attente
- ✅ Afficher un historique des changements
- ✅ Ajouter des tooltips explicatifs pour chaque paramètre

#### 3. **Support USB**

```javascript
// Si dispositif connecté en USB, envoyer directement
if (isUsbConnected(deviceId)) {
  await sendConfigViaUsb(deviceId, config)
  setSuccess('Configuration appliquée immédiatement via USB')
} else {
  // Sinon, créer commande OTA
  await createOtaCommand(deviceId, config)
  setSuccess('Configuration sera appliquée à la prochaine connexion OTA')
}
```

## Plan d'Action Recommandé

### Phase 1 : Clarification Immédiate (Urgent)
1. ✅ Ajouter un message d'avertissement dans l'onglet Configuration
2. ✅ Expliquer clairement que les changements ne sont pas appliqués immédiatement
3. ✅ Ajouter un lien vers le système de commandes pour les paramètres avancés

### Phase 2 : Unification (Court terme)
1. ✅ Implémenter Option 1 (Unifier les systèmes)
2. ✅ Créer automatiquement une commande OTA lors de la sauvegarde
3. ✅ Ajouter vérification de disponibilité
4. ✅ Améliorer les messages de feedback

### Phase 3 : Améliorations (Moyen terme)
1. ✅ Ajouter support USB
2. ✅ Ajouter historique des changements
3. ✅ Ajouter prévisualisation avant/après
4. ✅ Ajouter plus de paramètres dans l'onglet Configuration

## Questions pour Décision

1. **Quelle option préférez-vous ?** (Option 1, 2, ou 3)
2. **Souhaitez-vous le support USB ?**
3. **Quels paramètres supplémentaires doivent être dans l'onglet Configuration ?**
4. **Faut-il vérifier la disponibilité avant de sauvegarder ?**

