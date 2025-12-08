# 🔍 Diagnostic des Mesures - Guide de dépannage

## Problème : Aucune mesure visible dans le dashboard

Ce guide vous aide à identifier si le problème vient de :
- ❌ **L'envoi** (firmware/API)
- ❌ **La base de données** (stockage)
- ❌ **Le frontend** (affichage)

---

## 📋 Étape 1 : Vérifier la base de données

### Option A : Via l'endpoint de diagnostic (Recommandé)

1. **Ouvrir le dashboard** et se connecter en tant qu'admin
2. **Ouvrir la console du navigateur** (F12)
3. **Exécuter cette commande** :

```javascript
fetch('/api.php/admin/diagnostic/measurements', {
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('token')
  }
})
.then(r => r.json())
.then(data => {
  console.log('📊 DIAGNOSTIC MESURES:', data)
  
  // Résumé rapide
  console.log('=== RÉSUMÉ ===')
  console.log(`Dispositifs: ${data.diagnostic.devices_count}`)
  console.log(`Mesures totales: ${data.diagnostic.measurements_total}`)
  console.log(`Mesures (24h): ${data.diagnostic.measurements_24h}`)
  console.log(`Dispositifs sans mesures: ${data.diagnostic.devices_without_measurements.length}`)
  
  // Détails
  if (data.diagnostic.latest_measurements.length > 0) {
    console.log('\n📈 Dernières mesures:')
    data.diagnostic.latest_measurements.forEach(m => {
      console.log(`  - ${m.device_name} | ${m.timestamp} | Flow: ${m.flowrate} L/min`)
    })
  } else {
    console.log('\n⚠️ AUCUNE MESURE dans la base de données!')
  }
  
  if (data.diagnostic.devices_without_measurements.length > 0) {
    console.log('\n⚠️ Dispositifs sans mesures:')
    data.diagnostic.devices_without_measurements.forEach(d => {
      console.log(`  - ${d.device_name} (ICCID: ${d.sim_iccid})`)
    })
  }
})
```

### Option B : Via l'API directement

```bash
# Remplacer YOUR_TOKEN par votre token JWT
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://votre-api.com/api.php/admin/diagnostic/measurements
```

---

## 🔍 Étape 2 : Analyser les résultats

### ✅ Si `measurements_total > 0` :
**→ Les mesures sont enregistrées en BDD**

**Vérifier ensuite :**
1. **Le frontend charge-t-il les mesures ?**
   - Ouvrir le modal "Historique des mesures" d'un dispositif
   - Vérifier la console pour les erreurs
   - Vérifier l'endpoint `/api.php/devices/{id}/history`

2. **Les mesures sont-elles récentes ?**
   - Si `measurements_24h = 0` → Le dispositif n'envoie plus
   - Vérifier les logs du firmware
   - Vérifier la connexion réseau du dispositif

### ❌ Si `measurements_total = 0` :
**→ Aucune mesure n'a été enregistrée**

**Causes possibles :**
1. **Le dispositif n'a jamais envoyé de mesure**
   - Vérifier que le dispositif est bien configuré
   - Vérifier les logs USB si connecté
   - Vérifier que le firmware envoie bien les mesures

2. **L'API rejette les mesures**
   - Vérifier les logs du serveur API
   - Vérifier que l'ICCID est correct
   - Vérifier que l'endpoint `/api.php/devices/measurements` fonctionne

3. **Erreur lors de l'insertion en BDD**
   - Vérifier les logs de la base de données
   - Vérifier la structure de la table `measurements`
   - Vérifier les contraintes (device_id, etc.)

---

## 🧪 Étape 3 : Tester l'envoi de mesure

### Test manuel via l'API

```bash
# Remplacer ICCID par un ICCID valide
curl -X POST https://votre-api.com/api.php/devices/measurements \
  -H "Content-Type: application/json" \
  -d '{
    "sim_iccid": "VOTRE_ICCID",
    "flow_lpm": 2.5,
    "battery_percent": 85,
    "rssi": -75,
    "status": "TEST",
    "timestamp": "2024-01-01T12:00:00Z"
  }'
```

**Résultat attendu :**
```json
{
  "success": true,
  "device_id": 123,
  "measurement_id": 456,
  "device_auto_registered": false
}
```

---

## 🔧 Étape 4 : Vérifier le frontend

### Vérifier que les mesures sont chargées

1. **Ouvrir le dashboard**
2. **Cliquer sur un dispositif** → Voir les détails
3. **Ouvrir "Historique des mesures"**
4. **Vérifier la console** pour les erreurs

### Endpoints à vérifier :

- ✅ `/api.php/devices/{id}/history` → Historique d'un dispositif
- ✅ `/api.php/measurements/latest` → Dernières mesures (24h)
- ✅ `/api.php/admin/diagnostic/measurements` → Diagnostic complet

---

## 📊 Résumé des endpoints

| Endpoint | Méthode | Description | Auth |
|----------|---------|-------------|------|
| `/api.php/devices/measurements` | POST | Envoyer une mesure | ICCID uniquement |
| `/api.php/devices/{id}/history` | GET | Historique d'un dispositif | JWT |
| `/api.php/measurements/latest` | GET | Dernières mesures (24h) | JWT |
| `/api.php/admin/diagnostic/measurements` | GET | Diagnostic complet | Admin |

---

## 🐛 Problèmes courants

### 1. "Aucune mesure trouvée" mais mesures en BDD
**Cause :** Problème de filtrage ou de jointure SQL
**Solution :** Vérifier que `deleted_at IS NULL` sur les dispositifs

### 2. Mesures envoyées mais pas enregistrées
**Cause :** Erreur lors de l'insertion en BDD
**Solution :** Vérifier les logs du serveur, contraintes de clé étrangère

### 3. Dispositif créé mais pas de mesures
**Cause :** Le dispositif n'envoie pas de mesures
**Solution :** Vérifier la configuration du firmware, connexion réseau

### 4. Mesures visibles en BDD mais pas dans le frontend
**Cause :** Problème de chargement des données
**Solution :** Vérifier la console du navigateur, les erreurs API

---

## 📝 Checklist de diagnostic

- [ ] Vérifier la base de données via `/admin/diagnostic/measurements`
- [ ] Vérifier que des dispositifs existent
- [ ] Vérifier que des mesures existent
- [ ] Vérifier que les mesures sont récentes (< 24h)
- [ ] Tester l'envoi manuel d'une mesure
- [ ] Vérifier les logs du serveur API
- [ ] Vérifier les logs du firmware (USB)
- [ ] Vérifier la console du navigateur
- [ ] Vérifier que les endpoints API répondent correctement

---

## 🔗 Liens utiles

- **Endpoint de diagnostic :** `/api.php/admin/diagnostic/measurements`
- **Historique dispositif :** `/api.php/devices/{id}/history`
- **Dernières mesures :** `/api.php/measurements/latest`

