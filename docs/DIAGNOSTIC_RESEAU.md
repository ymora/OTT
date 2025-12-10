# 🔍 Diagnostic Configuration Réseau - Problème de Connexion

## 📋 Problème Signalé
Le réseau du dispositif ne fonctionne plus. Il y a 2-3 jours, cela fonctionnait après plusieurs tentatives avec Orange/Free.

## 🔎 Analyse Complète

### 1. Configuration APN dans le Firmware

#### ✅ Points Vérifiés
- **APN par défaut**: `OTT_DEFAULT_APN = "free"` (ligne 84)
- **Variable globale**: `NETWORK_APN = OTT_DEFAULT_APN` (ligne 119)
- **Chargement depuis NVS**: `NETWORK_APN = prefs.getString("apn", NETWORK_APN)` (ligne 2502)
- **Sauvegarde en NVS**: `prefs.putString("apn", NETWORK_APN)` (ligne 2594)
- **Traitement UPDATE_CONFIG**: L'APN est bien traité (lignes 2266-2272)
- **Utilisation lors connexion**: `modem.sendAT(GF("+CGDCONT=1,\"IP\",\""), NETWORK_APN.c_str(), "\"")` (ligne 956)

#### ⚠️ Points à Vérifier
1. **APN recommandé par opérateur**: La fonction `getRecommendedApnForOperator()` est appelée mais seulement si `REG_DENIED` (ligne 1516)
2. **APN alternatif dans connectData()**: L'APN recommandé est utilisé en fallback (lignes 1638-1644)

### 2. Configuration APN dans le Dashboard

#### ✅ Points Vérifiés
- **Champ dans le modal**: `apn` est présent dans `formData` (ligne 89)
- **Chargement depuis API**: `apn: data.config.apn || ''` (ligne 244)
- **Envoi dans configPayload**: `configPayload.apn = formData.apn.trim()` (ligne 577)
- **Mapping dans buildUpdateConfigPayload**: `addString('apn', config.apn)` (ligne 33)

#### ⚠️ Points à Vérifier
1. **API ne stocke pas l'APN en BDD**: L'APN est envoyé au firmware mais pas stocké en BDD (ligne 73-74 de `api/handlers/devices/config.php`)
2. **Chargement depuis API**: Si l'APN n'est pas en BDD, il ne sera pas chargé dans le modal

### 3. Logique de Connexion Réseau

#### ✅ Améliorations du Commit a2548cf7
- **Timeout augmenté**: 30s → 60s (ligne 1542)
- **Vérifications multiples**: `getRegistrationStatus()`, `waitForNetwork()`, `isNetworkConnected()` (lignes 1546-1588)
- **Délais de stabilisation**: 1s + 2s supplémentaires si nécessaire (lignes 1549-1568)
- **Timeout waitForNetwork**: 2s → 5s (ligne 1574)

#### ⚠️ Points à Vérifier
1. **APN alternatif**: L'APN recommandé n'est utilisé que si `REG_DENIED` ET `retryCount == 0` (ligne 1516)
2. **APN dans connectData()**: L'APN recommandé est utilisé en fallback mais seulement si différent de `NETWORK_APN` (ligne 1641)

### 4. Fonction getRecommendedApnForOperator()

#### ✅ Codes Opérateurs Supportés
- **Orange France** (20801/20802): `"orange"`
- **SFR France** (20810/20811): `"sl2sfr"`
- **Free Mobile** (20815/20816): `"free"`
- **Bouygues Telecom** (20820): `"mmsbouygtel"`

#### ⚠️ Points à Vérifier
1. **Détection opérateur**: `modem.getOperator()` retourne-t-il le bon format ?
2. **Format attendu**: La fonction cherche `"20815"` dans le code opérateur, mais `getOperator()` peut retourner un format différent

## 🔧 Corrections Proposées

### 1. Améliorer la Détection et Application de l'APN

**Problème**: L'APN recommandé n'est utilisé que si `REG_DENIED`, mais il devrait être utilisé dès le début si l'opérateur est détecté.

**Solution**: Utiliser l'APN recommandé dès le début de `attachNetworkWithRetry()` si l'opérateur est détecté et que l'APN configuré est différent.

### 2. Stocker l'APN en BDD (Optionnel mais Recommandé)

**Problème**: L'APN n'est pas stocké en BDD, donc il n'est pas visible dans le modal après configuration.

**Solution**: Ajouter l'APN dans `device_configurations` (colonne optionnelle) pour traçabilité.

### 3. Améliorer les Logs de Diagnostic

**Problème**: Les logs ne montrent pas clairement quel APN est utilisé et pourquoi.

**Solution**: Ajouter des logs détaillés sur l'APN utilisé, l'opérateur détecté, et les tentatives de connexion.

### 4. Vérifier le Format de getOperator()

**Problème**: `getOperator()` peut retourner un format différent de celui attendu.

**Solution**: Ajouter des logs pour voir exactement ce que retourne `getOperator()` et adapter la fonction si nécessaire.

## 📝 Actions Immédiates

1. ✅ Vérifier que l'APN est bien envoyé depuis le modal
2. ✅ Vérifier que l'APN est bien sauvegardé en NVS
3. ✅ Vérifier que l'APN est bien utilisé lors de la connexion
4. ⚠️ Améliorer l'utilisation de l'APN recommandé
5. ⚠️ Ajouter des logs de diagnostic
6. ⚠️ Vérifier le format de getOperator()

## 🔗 Fichiers Concernés

- `hardware/firmware/fw_ott_optimized/fw_ott_optimized.ino` (lignes 956, 1406-1427, 1516-1535, 1634-1673)
- `components/DeviceModal.js` (lignes 89, 244, 577)
- `api/handlers/devices/config.php` (lignes 73-74, 114)
- `lib/deviceCommands.js` (ligne 33)

