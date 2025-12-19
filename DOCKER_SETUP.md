# 🐳 Configuration Docker - OTT API

## ✅ Statut : FONCTIONNEL

L'environnement Docker est maintenant complètement opérationnel avec :
- ✅ PostgreSQL initialisé avec le bon schéma (`date_of_birth` au lieu de `birth_date`)
- ✅ API PHP fonctionnelle sur http://localhost:8000
- ✅ Tests de création de patients réussis

## 🚀 Démarrage Rapide

### Option 1 : Script complet (recommandé)
```powershell
.\scripts\dev\docker_complete.ps1
```

Ce script :
1. Nettoie les conteneurs existants
2. Démarre PostgreSQL
3. Initialise la base de données avec le schéma complet
4. Démarre l'API
5. Teste l'API (health check, login, création patient)

### Option 2 : Démarrage manuel
```powershell
# 1. Démarrer PostgreSQL
docker compose up -d db

# 2. Attendre que PostgreSQL soit prêt (environ 5 secondes)
Start-Sleep -Seconds 5

# 3. Initialiser la base de données
Get-Content sql/schema.sql -Raw | docker exec -i ott-postgres psql -U postgres -d ott_data

# 4. Démarrer l'API
docker compose up -d api

# 5. Tester
.\scripts\dev\test_api.ps1
```

## 📋 Services Disponibles

- **API PHP**: http://localhost:8000
- **Health Check**: http://localhost:8000/index.php
- **PostgreSQL**: localhost:5432
  - User: `postgres`
  - Password: `postgres`
  - Database: `ott_data`

## 🔧 Configuration Frontend

Pour utiliser l'API Docker avec le frontend Next.js :

1. Créez un fichier `.env.local` à la racine du projet :
```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_ENABLE_DEMO_RESET=false
```

2. Redémarrez le serveur Next.js :
```bash
npm run dev
```

## 📋 Commandes Utiles

### Voir les logs
```powershell
# Logs de l'API
docker compose logs -f api

# Logs de PostgreSQL
docker compose logs -f db
```

### Arrêter les services
```powershell
docker compose down
```

### Redémarrer les services
```powershell
docker compose restart
```

### Accéder à PostgreSQL
```powershell
docker exec -it ott-postgres psql -U postgres -d ott_data
```

### Réinitialiser complètement
```powershell
# Supprime les volumes (⚠️ supprime toutes les données)
docker compose down -v

# Puis relancez docker_complete.ps1
.\scripts\dev\docker_complete.ps1
```

## ✅ Tests

Le script `test_api.ps1` vérifie :
1. ✅ Health check (connexion base de données)
2. ✅ Login (authentification JWT)
3. ✅ Création patient avec `date_of_birth` (test de la correction)

## 🔍 Dépannage

### L'API ne démarre pas
```powershell
# Vérifier les logs
docker compose logs api

# Vérifier que PostgreSQL est prêt
docker exec ott-postgres pg_isready -U postgres
```

### Erreur "column date_of_birth does not exist"
```powershell
# Réinitialiser la base de données
docker compose down -v
docker compose up -d db
Start-Sleep -Seconds 5
Get-Content sql/schema.sql -Raw | docker exec -i ott-postgres psql -U postgres -d ott_data
docker compose restart api
```

### Erreur de connexion à la base
```powershell
# Vérifier que les variables d'environnement sont correctes
docker compose config

# Vérifier la connexion depuis le conteneur API
docker exec ott-api php -r "echo getenv('DB_HOST');"
```

## 📝 Notes

- Le schéma SQL utilise `date_of_birth` (pas `birth_date`)
- Les données sont persistantes dans le volume Docker `postgres_data`
- Pour supprimer toutes les données, utilisez `docker compose down -v`
- L'API est accessible depuis le host sur le port 8000

