# OTT - Déploiement OVH VPS

## Architecture Multi-Environnement

### 🎯 Objectif
Déployer l'application OTT sur OVH VPS en gardant Render comme fallback et Docker pour le développement local.

### 📋 Environnements

| Environnement | Services | Usage |
|---------------|----------|-------|
| **OVH VPS** | API PHP + PostgreSQL + Redis | Production principale |
| **Render** | Dashboard Next.js | Backup / Fallback |
| **Docker Local** | Tous les services | Développement |
| **GitHub Pages** | Dashboard statique | Frontend statique |

---

## 🚀 Déploiement Rapide

### 1. Achat VPS OVH
```bash
# Recommandé : VPS SSD 2GB minimum
# OS : Ubuntu 22.04 LTS
# Localisation : France (Paris ou Gravelines)
```

### 2. Installation Initiale
```bash
# Connectez-vous à votre VPS via SSH
ssh root@your-vps-ip

# Lancez le script d'installation automatique
curl -sSL https://raw.githubusercontent.com/ymora/OTT/main/scripts/deploy/ovh-setup.sh | bash
```

### 3. Configuration
```bash
# Configurez les variables d'environnement
cd /opt/ott
cp .env.ovh.example .env.production
nano .env.production  # Éditez avec vos valeurs

# Configurez votre domaine
nano nginx/conf.d/ott-api.conf  # Remplacez "ott-dev.happlyzmedical.com"
```

### 4. SSL et Domaine
```bash
# Configurez votre domaine (A record vers IP du VPS)
# Puis générez le certificat SSL
certbot --nginx -d ott-dev.happlyzmedical.com
```

### 5. Déploiement
```bash
# Lancez le déploiement
./scripts/deploy/deploy-ovh.sh
```

---

## 🔧 Configuration Détaillée

### Variables d'Environnement (.env.production)
```bash
# Base de données
DB_NAME=ott_production
DB_USER=ott_user
DB_PASSWORD=CHANGE_ME_STRONG_PASSWORD

# Redis
REDIS_PASSWORD=CHANGE_ME_REDIS_PASSWORD

# JWT
JWT_SECRET=CHANGE_ME_JWT_SECRET_64_CHARS_MINIMUM

# Application
APP_ENV=production
APP_DEBUG=false
CORS_ALLOWED_ORIGINS=https://ymora.github.io,https://ott-dashboard.onrender.com,https://ott-dev.happlyzmedical.com
```

### Secrets GitHub
À configurer dans GitHub > Settings > Secrets > Actions:

| Secret | Valeur |
|--------|--------|
| `OVH_HOST` | IP de votre VPS OVH |
| `OVH_USER` | Utilisateur SSH (ex: root) |
| `OVH_SSH_KEY` | Clé SSH privée |
| `OVH_PORT` | Port SSH (défaut: 22) |
| `RENDER_API_KEY` | Clé API Render |
| `RENDER_SERVICE_ID` | ID service Render |

---

## 🐳 Docker Compose OVH

### Services
- **api** : PHP 8.2 + Apache (port 80/443)
- **db** : PostgreSQL 15 (local uniquement)
- **redis** : Redis 7 (local uniquement)
- **nginx** : Reverse proxy avec SSL

### Commandes Utiles
```bash
# Démarrer les services
docker-compose -f docker-compose.ovh.yml up -d

# Voir les logs
docker-compose -f docker-compose.ovh.yml logs -f

# Redémarrer un service
docker-compose -f docker-compose.ovh.yml restart api

# Mise à jour
docker-compose -f docker-compose.ovh.yml pull && docker-compose -f docker-compose.ovh.yml up -d
```

---

## 🔄 Déploiement Automatique

### GitHub Actions
Le workflow `.github/workflows/deploy-multi-env.yml` gère :

1. **Tests** : Lint, tests unitaires, build
2. **Build** : Images Docker multi-arch
3. **Déploiement OVH** : SSH + Docker Compose
4. **Déploiement Render** : Trigger API
5. **GitHub Pages** : Dashboard statique
6. **Health Checks** : Vérification post-déploiement

### Déclenchement
- **Automatique** : Push sur `main`
- **Manuel** : GitHub Actions > "Run workflow"
- **PR** : Tests seulement (pas de déploiement)

---

## 📊 Monitoring

### Health Checks
```bash
# API OVH
curl https://ott-dev.happlyzmedical.com/api.php/health

# API Render
curl https://ott-api-c387.onrender.com/api.php/health

# Dashboard GitHub Pages
curl https://ymora.github.io/OTT/
```

### Logs
```bash
# Logs application
docker-compose -f docker-compose.ovh.yml logs -f api

# Logs nginx
docker-compose -f docker-compose.ovh.yml logs -f nginx

# Logs système
journalctl -u ott.service -f
```

---

## 🔒 Sécurité

### Firewall (UFW)
```bash
# Ports ouverts
ufw allow ssh    # SSH
ufw allow 80     # HTTP
ufw allow 443    # HTTPS
```

### SSL/TLS
- Let's Encrypt automatique avec certbot
- Renouvellement automatique dans le déploiement
- Headers sécurité configurés dans Nginx

### Backups
```bash
# Base de données automatique tous les jours à 2h
crontab -l | grep backup
# 0 2 * * * /opt/ott/backup.sh

# Manuels
docker exec ott-db-ovh pg_dump -U ott_user ott > backup.sql
```

---

## 🚨 Dépannage

### Problèmes Communs

#### API ne répond pas
```bash
# Vérifier les services
docker-compose -f docker-compose.ovh.yml ps

# Redémarrer l'API
docker-compose -f docker-compose.ovh.yml restart api

# Vérifier les logs
docker-compose -f docker-compose.ovh.yml logs api
```

#### SSL Certificate Error
```bash
# Renouveler manuellement
certbot renew --quiet
docker-compose -f docker-compose.ovh.yml restart nginx
```

#### Database Connection Error
```bash
# Vérifier PostgreSQL
docker exec ott-db-ovh pg_isready -U ott_user -d ott

# Redémarrer la base
docker-compose -f docker-compose.ovh.yml restart db
```

---

## 📈 Performance

### Optimisations
- **OPcache** PHP activé
- **Redis** pour le cache
- **Nginx** gzip et cache statique
- **PostgreSQL** optimisé pour VPS

### Monitoring Resources
```bash
# Usage mémoire/CPU
htop

# Usage disque
df -h

# Usage Docker
docker stats
```

---

## 🆘 Support

### En cas de problème :
1. Vérifiez les logs : `docker-compose -f docker-compose.ovh.yml logs -f`
2. Consultez le monitoring : `htop`, `docker stats`
3. Redémarrez les services : `docker-compose -f docker-compose.ovh.yml restart`
4. Contactez le support si nécessaire

### Documentation Complémentaire
- [Docker Compose](docker-compose.ovh.yml)
- [Scripts de déploiement](scripts/deploy/)
- [Configuration Nginx](nginx/)
- [GitHub Actions](.github/workflows/)

---

## 🎉 Conclusion

Votre architecture est maintenant prête pour :
- **Production** sur OVH VPS (robuste et économique)
- **Fallback** sur Render (si besoin)
- **Développement** local avec Docker
- **Déploiement** automatisé via GitHub Actions

Bon déploiement ! 🚀
