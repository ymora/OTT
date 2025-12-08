# 🔍 Script de vérification des mesures

## Utilisation

Ce script se connecte directement à la base de données pour vérifier si des mesures sont enregistrées.

### Prérequis

1. **Variables d'environnement configurées** :
   - `DB_HOST` : Adresse du serveur de base de données
   - `DB_NAME` : Nom de la base de données
   - `DB_USER` : Utilisateur de la base de données
   - `DB_PASS` : Mot de passe (optionnel)
   - `DB_PORT` : Port (optionnel, défaut: 5432 pour PostgreSQL)
   - OU `DATABASE_URL` : URL complète de connexion

2. **PHP installé** avec extension PDO et PostgreSQL/MySQL

### Exécution

#### Option 1 : Via ligne de commande (si PHP est installé localement)

```bash
php scripts/check-measurements-direct.php
```

#### Option 2 : Via le serveur web (si le script est accessible)

Si votre serveur web peut exécuter des scripts PHP en ligne de commande, vous pouvez aussi créer un endpoint temporaire.

#### Option 3 : Via l'endpoint API (recommandé pour production)

Utilisez l'endpoint de diagnostic créé :
```
GET /api.php/admin/diagnostic/measurements
```

### Ce que le script vérifie

1. ✅ **Connexion à la base de données**
2. ✅ **Nombre de dispositifs actifs**
3. ✅ **Nombre total de mesures**
4. ✅ **Mesures par dispositif**
5. ✅ **Dernières 10 mesures**
6. ✅ **Mesures des dernières 24 heures**
7. ✅ **Dispositifs sans mesures**

### Interprétation des résultats

#### Si `measurements_total = 0` :
❌ **Aucune mesure dans la base de données**
- Le problème vient de l'envoi des mesures
- Vérifiez :
  - Que le dispositif envoie bien les mesures
  - Les logs du serveur API
  - L'endpoint `/api.php/devices/measurements`

#### Si `measurements_total > 0` mais `measurements_24h = 0` :
⚠️ **Mesures anciennes, plus d'envoi récent**
- Le dispositif n'envoie peut-être plus
- Vérifiez :
  - La connexion réseau du dispositif
  - Les logs du firmware
  - La configuration du dispositif

#### Si `measurements_total > 0` et `measurements_24h > 0` :
✅ **Mesures présentes dans la BDD**
- Si elles ne s'affichent pas dans le frontend :
  - Vérifiez la console du navigateur
  - Vérifiez les requêtes réseau
  - Vérifiez l'endpoint `/api.php/devices/{id}/history`

### Exemple de sortie

```
=== VÉRIFICATION DIRECTE DES MESURES ===

📡 Connexion à la base de données...
   Type: pgsql
   Host: localhost
   Port: 5432
   Database: ott_data
   User: postgres

✅ Connexion réussie!

1️⃣  DISPOSITIFS:
   Total dispositifs actifs: 3
   Liste des dispositifs:
   1. ID: 1 | ICCID: 89331508210512788370 | Nom: OTT-01-001
      Serial: OTT-01-001 | Dernière vue: 2024-01-15 10:30:00 | Batterie: 85.0%

2️⃣  MESURES:
   Total mesures: 150
   Mesures par dispositif:
   - OTT-01-001 (ICCID: 89331508210512788370): 150 mesures
     Première: 2024-01-01 08:00:00 | Dernière: 2024-01-15 10:30:00

3️⃣  DERNIÈRES MESURES (10):
   1. OTT-01-001 | 2024-01-15 10:30:00
      Flow: 2.50 L/min | Bat: 85.0% | RSSI: -75 dBm | Status: EVENT

4️⃣  MESURES DES DERNIÈRES 24 HEURES:
   Total: 5 mesures
   Par dispositif:
   - OTT-01-001 (ICCID: 89331508210512788370): 5 mesures | Dernière: 2024-01-15 10:30:00

=== RÉSUMÉ ===
✅ Dispositifs: 3
✅ Mesures totales: 150
✅ Mesures (24h): 5
✅ Dispositifs sans mesures: 0
```

