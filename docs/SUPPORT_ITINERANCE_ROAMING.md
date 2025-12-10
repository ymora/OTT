# Support Itinérance (Roaming) - Documentation

## Fonctionnalité Ajoutée

Le dispositif peut maintenant **activer ou désactiver l'itinérance** depuis le modal de configuration.

## Comportement

### Itinérance Activée (par défaut)

- ✅ Le dispositif accepte les connexions en itinérance (`REG_OK_ROAMING`)
- ✅ Le dispositif peut utiliser le réseau d'autres opérateurs
- ✅ Fonctionne normalement même si Free n'est pas disponible

### Itinérance Désactivée

- ⚠️ Le dispositif **rejette** les connexions en itinérance (`REG_OK_ROAMING`)
- ⚠️ Seul le réseau de l'opérateur (`REG_OK_HOME`) est accepté
- ⚠️ Si le dispositif est en itinérance, il se déconnectera au prochain cycle

## Configuration dans le Modal

### Interface Utilisateur

Dans le modal de configuration, section **Mesure** :
- **📍 GPS** : Activer/désactiver le GPS
- **🌐 Itinérance** : Activer/désactiver l'itinérance (nouveau)

### Valeur par Défaut

- **Itinérance activée** (`true`) par défaut
- Permet au dispositif de fonctionner même si le réseau Free n'est pas disponible

## Fonctionnement dans le Firmware

### Variable

```cpp
static bool roamingEnabled = true;  // Activé par défaut
```

### Logique d'Attachement Réseau

```cpp
RegStatus reg = modem.getRegistrationStatus();

// Vérifier si l'itinérance est autorisée
if (reg == REG_OK_ROAMING && !roamingEnabled) {
  Serial.println(F("[MODEM] ⚠️  Itinérance détectée mais désactivée - Rejet de la connexion"));
  Serial.println(F("[MODEM] 💡 Activez l'itinérance dans la configuration pour autoriser le roaming"));
  // Continuer à attendre une connexion sur le réseau de l'opérateur (REG_OK_HOME)
  continue;
}

if (reg == REG_OK_HOME || (reg == REG_OK_ROAMING && roamingEnabled)) {
  // Connexion acceptée
  return true;
}
```

### Sauvegarde en NVS

```cpp
prefs.putBool("roaming_enabled", roamingEnabled);
```

### Chargement depuis NVS

```cpp
roamingEnabled = prefs.getBool("roaming_enabled", true);  // Activé par défaut
```

### Commande UPDATE_CONFIG

Le firmware accepte le paramètre `roaming_enabled` dans `UPDATE_CONFIG` :

```json
{
  "command": "UPDATE_CONFIG",
  "payload": {
    "roaming_enabled": true
  }
}
```

## Sauvegarde en Base de Données

### Colonne

```sql
ALTER TABLE device_configurations
ADD COLUMN IF NOT EXISTS roaming_enabled BOOLEAN DEFAULT true;
```

### Création Automatique

La colonne est créée automatiquement lors de la première sauvegarde de configuration.

## Logs

### Activation

```
✅ [CMD] Itinérance changée: OFF → ON
[MODEM] ✅ Itinérance activée - Le dispositif peut utiliser le réseau d'autres opérateurs
```

### Désactivation

```
✅ [CMD] Itinérance changée: ON → OFF
[MODEM] ⚠️  Itinérance désactivée - Seul le réseau de l'opérateur sera accepté
[MODEM] 💡 Si le dispositif est en itinérance, il se déconnectera au prochain cycle
```

### Rejet d'Itinérance

```
[MODEM] ⚠️  Itinérance détectée mais désactivée - Rejet de la connexion
[MODEM] 💡 Activez l'itinérance dans la configuration pour autoriser le roaming
```

## Cas d'Usage

### Cas 1 : Itinérance Activée (Recommandé)

**Situation** : Dispositif en zone où Free n'est pas disponible
- ✅ Le dispositif se connecte automatiquement au réseau d'un autre opérateur
- ✅ Fonctionne normalement
- ⚠️ Peut entraîner des coûts supplémentaires selon le forfait

### Cas 2 : Itinérance Désactivée

**Situation** : Forfait sans itinérance ou coûts élevés
- ⚠️ Le dispositif rejette les connexions en itinérance
- ⚠️ Ne fonctionne que sur le réseau Free
- ✅ Évite les coûts d'itinérance

## Recommandations

### Pour Free Mobile (Puce Free Pro)

1. **Vérifier le forfait** : Confirmer avec Free que l'itinérance est incluse
2. **Activer l'itinérance** : Permet une meilleure couverture réseau
3. **Surveiller les coûts** : Si l'itinérance est facturée, la désactiver

### Pour Autres Opérateurs

- **Orange, SFR, Bouygues** : Généralement l'itinérance est incluse en France
- **Vérifier** : Consulter les conditions du forfait

## Vérification

### Dans les Logs USB

Après configuration, vérifier dans les logs :

```
✅ [CMD] Itinérance changée: OFF → ON
[MODEM] ✅ Itinérance activée - Le dispositif peut utiliser le réseau d'autres opérateurs
```

### Dans le Modal

1. Ouvrir le modal de configuration
2. Vérifier que la checkbox **🌐 Itinérance** est coché/décochée selon vos besoins
3. Sauvegarder
4. Vérifier les logs pour confirmer le changement

## Notes Techniques

- ⚠️ **Persistance** : Le paramètre est sauvegardé en NVS et persiste après reset
- ⚠️ **Rejet immédiat** : Si l'itinérance est désactivée et que le dispositif est en roaming, il se déconnecte immédiatement
- ✅ **Par défaut** : L'itinérance est activée par défaut pour une meilleure compatibilité
- ✅ **OTA** : Le paramètre peut être modifié via `UPDATE_CONFIG` sans recompiler le firmware

