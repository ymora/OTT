# Configuration APN et Itinérance - Guide Complet

## Questions Fréquentes

### 1. "Free 4G" sur mon téléphone = APN à configurer ?

**NON** ❌ - "Free 4G" est le **nom de l'opérateur** affiché, pas l'APN.

**Différence importante** :
- **Nom opérateur** : "Free 4G", "Orange", "SFR", "Bouygues" → C'est ce que vous voyez sur votre téléphone
- **APN** : "free", "orange", "sfr", "bouygues" → C'est ce qu'il faut configurer dans le dispositif

**Pour Free Mobile** :
- ✅ **APN correct** : `free` (tout en minuscules)
- ❌ **APN incorrect** : "Free 4G", "FREE", "Free Mobile"

### 2. Pourquoi mon téléphone s'enregistre automatiquement mais pas le dispositif ?

**Votre téléphone** :
- ✅ Détecte automatiquement l'opérateur
- ✅ Configure automatiquement l'APN
- ✅ Gère l'itinérance automatiquement
- ✅ Utilise les paramètres réseau de l'opérateur (profil SIM)

**Le dispositif IoT** :
- ⚠️ Doit configurer l'APN **manuellement** (pas de profil SIM automatique)
- ✅ Peut détecter l'opérateur mais doit utiliser l'APN configuré
- ⚠️ L'itinérance doit être activée si nécessaire

**Pourquoi cette différence ?**
- Les téléphones modernes ont des **profils SIM** préconfigurés par l'opérateur
- Les dispositifs IoT (modem 4G) n'ont **pas de profil SIM** → configuration manuelle requise

### 3. Qu'est-ce que l'itinérance des données et comment l'activer ?

**Itinérance (Roaming)** :
- Permet d'utiliser le réseau d'un **autre opérateur** quand votre opérateur n'est pas disponible
- Exemple : Free Mobile peut utiliser le réseau Orange en itinérance
- **Important** : Peut entraîner des **coûts supplémentaires** selon votre forfait

**Activation pour le dispositif** :

Le firmware **détecte automatiquement** l'itinérance mais ne l'active pas explicitement. Voici comment vérifier :

1. **Vérifier le statut d'enregistrement** :
   ```
   REG_OK_HOME     → Enregistré sur le réseau de l'opérateur (Free)
   REG_OK_ROAMING  → Enregistré en itinérance (autre opérateur)
   REG_DENIED      → Accès refusé
   ```

2. **Le firmware accepte l'itinérance** :
   - Si `REG_OK_ROAMING` → Le dispositif fonctionne normalement
   - Pas besoin de configuration supplémentaire

3. **Activer l'itinérance sur la puce Free Pro** :
   - Vérifier avec Free que l'itinérance est activée sur votre forfait
   - Le dispositif utilisera automatiquement l'itinérance si disponible

## Configuration APN par Opérateur

### Free Mobile

**APN** : `free`

**Configuration dans le dashboard** :
```
APN: free
SIM PIN: [votre code PIN si configuré]
```

**Détection automatique** :
- Le firmware détecte l'opérateur "Free" ou "20810" (code MCC/MNC)
- Utilise automatiquement l'APN "free" si configuré

### Orange

**APN** : `orange`

**Configuration** :
```
APN: orange
```

### SFR

**APN** : `sfr`

**Configuration** :
```
APN: sfr
```

### Bouygues Telecom

**APN** : `bouygues`

**Configuration** :
```
APN: bouygues
```

### APN Générique (Fallback)

Si l'opérateur n'est pas reconnu, le firmware essaie :
- `internet` (APN générique)
- L'APN configuré manuellement

## Fonctionnement du Firmware

### 1. Détection Automatique de l'Opérateur

```cpp
String oper = modem.getOperator();
// Exemple: "Free", "Orange", "SFR", "Bouygues"
```

### 2. Sélection de l'APN

Le firmware utilise cette logique :

1. **APN configuré manuellement** (depuis le dashboard) → Priorité 1
2. **APN recommandé** (selon l'opérateur détecté) → Priorité 2
3. **APN générique "internet"** → Fallback

### 3. Gestion de l'Itinérance

```cpp
RegStatus reg = modem.getRegistrationStatus();
switch (reg) {
    case REG_OK_HOME:     // Réseau de l'opérateur
    case REG_OK_ROAMING:  // Itinérance (autre opérateur)
        // Le dispositif fonctionne normalement
        break;
    case REG_DENIED:
        // Accès refusé
        break;
}
```

**Important** : Le firmware **accepte l'itinérance** (`REG_OK_ROAMING`) et fonctionne normalement.

## Configuration Recommandée

### Pour Free Mobile (Puce Free Pro)

1. **APN** : `free`
2. **SIM PIN** : [votre code PIN si configuré]
3. **Itinérance** : Vérifier avec Free que c'est activé sur votre forfait

### Vérification

Après configuration, vérifier dans les logs USB :

```
[MODEM] ✅ Opérateur détecté: Free → Utilisation APN: free
[MODEM] ✅ Enregistré sur le réseau (attaché)
[MODEM] ✅ GPRS connecté
```

Si vous voyez :
```
[MODEM] ⚠️  Enregistré en itinérance (roaming)
```
→ C'est normal, le dispositif fonctionne en itinérance (utilise le réseau d'un autre opérateur)

## FAQ

### Q: Dois-je configurer "Free 4G" exactement comme sur mon téléphone ?

**R:** Non, configurez simplement `free` (en minuscules) dans le champ APN.

### Q: Pourquoi mon téléphone fonctionne automatiquement mais pas le dispositif ?

**R:** Les téléphones ont des profils SIM préconfigurés. Les dispositifs IoT nécessitent une configuration manuelle de l'APN.

### Q: L'itinérance est-elle activée automatiquement ?

**R:** Oui, si votre forfait Free Pro l'autorise. Le firmware détecte et accepte automatiquement l'itinérance (`REG_OK_ROAMING`).

### Q: Comment savoir si le dispositif est en itinérance ?

**R:** Vérifier les logs USB :
- `attaché (roaming)` → En itinérance
- `attaché` → Sur le réseau Free

### Q: L'itinérance coûte-t-elle plus cher ?

**R:** Cela dépend de votre forfait Free Pro. Vérifiez avec Free si l'itinérance est incluse ou facturée.

## Résumé

✅ **APN à configurer** : `free` (pas "Free 4G")
✅ **Itinérance** : Activée automatiquement si disponible sur votre forfait
✅ **Détection opérateur** : Automatique, mais APN doit être configuré manuellement
✅ **Fonctionnement** : Le dispositif fonctionne en itinérance si nécessaire (pas de configuration supplémentaire)

