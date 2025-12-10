# 🔍 Diagnostic : Mesures USB visibles mais pas dans l'historique

## Problème identifié

Les mesures sont visibles en **temps réel sur les logs USB** mais **absentes de l'historique** (modal 📊).

## Analyse du flux

### 1. Firmware (mode USB) - Ligne 460

```cpp
// Envoyer via réseau si disponible
if (modemReady && modem.isNetworkConnected()) {
  bool sent = sendMeasurement(m, ..., "USB_STREAM");
  // Log seulement toutes les 10 mesures
  if (sent && usbSequence % 10 == 0) {
    Serial.printf("[USB] ✅ Envoi réseau OK\n");
  } else {
    Serial.printf("[USB] ❌ Échec envoi réseau\n");
  }
}
```

**⚠️ PROBLÈME** : Les mesures ne sont envoyées à l'API **QUE si le modem est connecté**.

### 2. Initialisation modem en mode USB - Ligne 402

Le modem est initialisé **seulement si** :
- GPS activé, OU
- 30 secondes écoulées depuis la dernière tentative

**⚠️ PROBLÈME** : Si le modem échoue à démarrer, les mesures ne sont **jamais envoyées à l'API**.

### 3. API PHP - Ligne 201-212

L'API **insère correctement** les mesures dans la table `measurements` :
```php
INSERT INTO measurements (device_id, timestamp, flowrate, battery, signal_strength, device_status)
VALUES (:device_id, :timestamp, :flowrate, :battery, :rssi, :status)
```

### 4. Modal d'historique - Ligne 30

Le modal récupère correctement depuis `/api.php/devices/{id}/history`.

## Solutions

### Solution 1 : Vérifier les logs USB

Dans les logs USB, cherchez :
- `[USB] ✅ Envoi réseau OK` → Mesures envoyées avec succès
- `[USB] ❌ Échec envoi réseau` → Échec d'envoi
- `[MODEM] ✅ Modem initialisé` → Modem OK
- `[MODEM] ⚠️ Échec initialisation` → Modem non connecté

### Solution 2 : Forcer l'initialisation du modem en mode USB

Modifier le firmware pour **toujours** tenter d'initialiser le modem en mode USB, même si GPS désactivé.

### Solution 3 : Vérifier dans la base de données

Requête SQL pour vérifier si des mesures sont enregistrées :
```sql
SELECT COUNT(*) FROM measurements WHERE device_id = (SELECT id FROM devices WHERE sim_iccid = 'VOTRE_ICCID');
SELECT * FROM measurements WHERE device_id = (SELECT id FROM devices WHERE sim_iccid = 'VOTRE_ICCID') ORDER BY timestamp DESC LIMIT 10;
```

## Diagnostic immédiat

1. **Vérifiez les logs USB** : Cherchez `[USB] ✅ Envoi réseau OK` ou `[USB] ❌ Échec envoi réseau`
2. **Vérifiez le modem** : Cherchez `[MODEM] ✅ Modem initialisé` ou `[MODEM] ⚠️`
3. **Vérifiez la base de données** : Utilisez les requêtes SQL ci-dessus

## Conclusion probable

**Le modem n'est pas connecté en mode USB**, donc les mesures ne sont **jamais envoyées à l'API**, seulement affichées en local sur USB.

## ⚠️ Distinction importante

### Les LOGS USB (console)
- **Envoyés par** : Le dashboard (depuis votre PC) via HTTP
- **Destination** : Table `usb_logs` dans la base de données
- **Statut** : ✅ Fonctionne même si le modem n'est pas OK
- **Message** : `📤 1 log(s) envoyé(s) à la base de données` → **C'est normal !**

### Les MESURES du dispositif (flowrate, battery, etc.)
- **Envoyées par** : Le firmware du dispositif via le modem OTA
- **Destination** : Table `measurements` dans la base de données
- **Statut** : ❌ **Ne fonctionne PAS si le modem n'est pas OK**
- **Dans les logs USB** : Cherchez `[USB] ✅ Envoi réseau OK` → Si absent, les mesures ne sont PAS sauvegardées

**Conclusion** : Les logs USB sont bien sauvegardés, mais **les mesures du dispositif ne le sont pas** car le modem n'est pas connecté (eps=KO gprs=KO).

