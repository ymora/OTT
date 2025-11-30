# 🗄️ Accès à la Base de Données PostgreSQL

## 📋 Options Disponibles

Vous avez **3 méthodes** pour consulter la base de données :

---

## 1. 🌐 Interface Web (pgweb) - **RECOMMANDÉ**

### Démarrage
```bash
# Démarrer uniquement le service pgweb (si Docker est déjà lancé)
docker compose up -d pgweb

# OU démarrer tous les services
docker compose up -d
```

### Accès
- **URL** : http://localhost:8081
- **Interface** : Interface web complète pour consulter et modifier la base de données
- **Fonctionnalités** :
  - ✅ Visualisation des tables
  - ✅ Exécution de requêtes SQL
  - ✅ Export de données
  - ✅ Visualisation des schémas

### Configuration
Le service est déjà configuré dans `docker-compose.yml` :
```yaml
pgweb:
  image: sosedoff/pgweb:latest
  container_name: ott-pgweb
  ports:
    - "8081:8081"
  environment:
    PGWEB_DATABASE_URL: postgres://postgres:postgres@db:5432/ott_data?sslmode=disable
```

---

## 2. 💻 Ligne de Commande (psql)

### Accès direct au conteneur
```bash
# Se connecter au conteneur PostgreSQL
docker compose exec db psql -U postgres -d ott_data
```

### Commandes utiles
```sql
-- Lister les tables
\dt

-- Décrire une table
\d devices

-- Exécuter une requête
SELECT * FROM devices LIMIT 10;

-- Quitter
\q
```

---

## 3. 🔌 Client PostgreSQL Externe

### Connexion depuis un client externe (DBeaver, pgAdmin, etc.)

**Paramètres de connexion :**
- **Host** : `localhost`
- **Port** : `5432`
- **Database** : `ott_data`
- **User** : `postgres`
- **Password** : `postgres`

**Exemple avec psql (depuis votre machine) :**
```bash
psql -h localhost -p 5432 -U postgres -d ott_data
```

---

## 🚀 Démarrage Rapide

### Option 1 : Tous les services
```bash
docker compose up -d
```
Puis accéder à http://localhost:8081

### Option 2 : Uniquement pgweb (si db est déjà lancé)
```bash
docker compose up -d pgweb
```
Puis accéder à http://localhost:8081

### Option 3 : Vérifier que pgweb est lancé
```bash
docker compose ps
```

---

## 📊 Tables Principales

Une fois connecté, vous pouvez explorer :

- **`users`** - Utilisateurs du système
- **`devices`** - Dispositifs IoT
- **`patients`** - Patients
- **`measurements`** - Mesures de débit
- **`alerts`** - Alertes système
- **`firmwares`** - Versions de firmware
- **`audit_logs`** - Journal d'audit
- **`roles`** et **`permissions`** - Rôles et permissions

---

## 🔧 Dépannage

### Le service pgweb ne démarre pas
```bash
# Vérifier les logs
docker compose logs pgweb

# Redémarrer le service
docker compose restart pgweb
```

### Port 8081 déjà utilisé
Modifier `docker-compose.yml` :
```yaml
pgweb:
  ports:
    - "8082:8081"  # Changer 8081 en 8082 (ou autre port libre)
```

### Base de données non accessible
```bash
# Vérifier que le service db est lancé
docker compose ps db

# Vérifier les logs
docker compose logs db
```

---

## ⚠️ Notes Importantes

1. **Données de développement** : Les données dans Docker sont **séparées** de la base de production Render
2. **Sécurité** : Les identifiants par défaut (`postgres/postgres`) sont pour le développement uniquement
3. **Persistance** : Les données sont stockées dans un volume Docker (`postgres_data`)

---

## 📝 Commandes Utiles

```bash
# Voir les logs de la base de données
docker compose logs -f db

# Arrêter tous les services
docker compose down

# Arrêter et supprimer les volumes (⚠️ supprime les données)
docker compose down -v

# Redémarrer uniquement pgweb
docker compose restart pgweb
```

---

**Dernière mise à jour : 2025-01-XX**

