# 🐳 Configuration Docker - Développement Local

Ce dossier contient la configuration Docker pour le **développement local uniquement**.

## 🚀 Démarrage Rapide

```bash
# 1. Démarrer les conteneurs
docker-compose up -d

# 2. Initialiser la base de données
docker exec -i ott-postgres psql -U postgres -d ott_data < sql/schema.sql

# 3. Accéder à l'application
# Dashboard: http://localhost:3000
# API: http://localhost:8000
# PgWeb (BDD): http://localhost:8081
```

## 📦 Services

| Service | Port | Description |
|---------|------|-------------|
| **dashboard** | 3000 | Interface Next.js |
| **api** | 8000 | API PHP |
| **db** | 5432 | PostgreSQL 15 |
| **pgweb** | 8081 | Interface graphique BDD |

## 🔐 Accès par Défaut

**Base de données:**
- Host: `localhost`
- Port: `5432`
- Database: `ott_data`
- User: `postgres`
- Password: `postgres`

**Utilisateur Admin:**
- Email: `ymora@free.fr`
- Mot de passe: `Ym120879`

## ⚙️ Configuration

La configuration est centralisée dans:
- `docker-compose.yml` - Configuration Docker
- `env.example` - Template (à copier en `.env.local`)

## 📝 Notes

- Cette configuration est pour le **développement local uniquement**
- Pour la production, voir `render.yaml` (Render.com)
- Les données sont persistantes dans le volume `postgres_data`

## 🔄 Commandes Utiles

```bash
# Voir les logs
docker-compose logs -f

# Arrêter
docker-compose down

# Arrêter + supprimer les volumes (⚠️ perte de données)
docker-compose down -v

# Reconstruire
docker-compose build
docker-compose up -d

# Redémarrer un service
docker-compose restart api
```

## 🆘 Dépannage

**Base de données vide?**
```bash
docker exec -i ott-postgres psql -U postgres -d ott_data < sql/schema.sql
```

**Port déjà utilisé?**
```bash
# Modifier les ports dans docker-compose.yml
ports:
  - "3001:3000"  # Dashboard sur port 3001
```

**Connexion API échoue?**
- Vérifier que tous les conteneurs sont démarrés: `docker ps`
- Vérifier les logs: `docker-compose logs api`

