# Déploiement OTT - Guide Complet

## 🚀 Déploiement sur Render (Production)

### Prérequis
- Compte Render.com
- Repository Git avec le code OTT
- Plan Render (Starter ou supérieur)

### Étapes

1. **Connecter le repository**
   - Aller sur Render.com
   - Connecter votre repository GitHub/GitLab
   - Sélectionner le projet OTT

2. **Créer les services**
   ```yaml
   # render.yaml est déjà configuré, il suffit de pousser le code
   git push origin main
   ```

3. **Services créés automatiquement**:
   - `ott-api` (PHP avec compilation Arduino)
   - `ott-dashboard` (Next.js)
   - `ott-postgres` (PostgreSQL)

4. **Configuration automatique**:
   - Base de données initialisée avec `sql/schema.sql`
   - Utilisateur admin créé: `ymora@free.fr` / `Ym120879`
   - Variables d'environnement configurées
   - CORS autorisé pour le dashboard

5. **Vérification**:
   - API: https://ott-jbln.onrender.com/api.php/firmwares
   - Dashboard: https://ott-dashboard.onrender.com
   - Test compilation: upload .ino → compiler → flash

---

## 🏠 Déploiement Local (Docker)

### Prérequis
- Docker Desktop
- Git clone du repository

### Démarrage
```bash
# Cloner le repository
git clone <repository-url>
cd maxime

# Démarrer tous les services
docker-compose up -d

# Vérifier
docker ps
curl http://localhost:8000/api.php/firmwares
```

### Services
- API: http://localhost:8000
- Dashboard: http://localhost:3000
- DB: localhost:5432 (pgAdmin: http://localhost:5050)

---

## 🆕 Nouveau Serveur (Déploiement Manuel)

### Prérequis
- Ubuntu 20.04+ ou CentOS 8+
- Docker & Docker Compose
- Git

### Installation

1. **Installer Docker**
   ```bash
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh
   sudo usermod -aG docker $USER
   ```

2. **Installer Docker Compose**
   ```bash
   sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
   sudo chmod +x /usr/local/bin/docker-compose
   ```

3. **Déployer OTT**
   ```bash
   # Cloner
   git clone <repository-url>
   cd maxime
   
   # Configurer les variables d'environnement
   cp .env.example .env
   # Éditer .env avec vos configurations
   
   # Démarrer
   docker-compose up -d
   
   # Initialiser la base de données
   docker-compose exec api bash /var/www/html/scripts/db/init_database.sh
   ```

4. **Configuration SSL (Optionnel)**
   ```bash
   # Avec Traefik ou Nginx Proxy Manager
   # Voir docs/nginx-ssl.md
   ```

---

## 🗄️ Base de Données

### Initialisation Automatique
- Le script `scripts/db/init_database.sh` détecte si la DB est vide
- Applique `sql/schema.sql` automatiquement
- Crée l'utilisateur admin par défaut

### Utilisateurs Par Défaut
| Email | Rôle | Mot de passe |
|-------|------|--------------|
| ymora@free.fr | admin | Ym120879 |

### Migration
```sql
-- Pour ajouter error_message si manquant
ALTER TABLE firmware_versions ADD COLUMN IF NOT EXISTS error_message TEXT;
```

---

## ⚙️ Configuration Arduino

### Docker (Production)
- Les tools ESP32 sont pré-installés dans `/var/www/html/.arduino15`
- Accessible par `www-data` (utilisateur PHP)
- Pas de montage de volume qui écraserait l'installation

### Local
- Volume `.arduino15` monté pour le développement
- Tools installés au build Docker

### Render
- L'image Docker contient les tools ESP32
- Pas de volumes persistants nécessaires
- Rebuild après chaque déploiement (OK, tools inclus)

---

## 🔧 Dépannage

### Compilation ne fonctionne pas
1. Vérifier que `arduino-cli` est trouvé:
   ```bash
   docker exec ott-api which arduino-cli
   docker exec ott-api arduino-cli version
   ```

2. Vérifier les tools ESP32:
   ```bash
   docker exec ott-api ls -la /var/www/html/.arduino15/packages/esp32/tools/
   ```

3. Vérifier permissions:
   ```bash
   docker exec ott-api ls -la /var/www/html/.arduino15/
   ```

### Erreur 500 sur l'API
1. Logs PHP:
   ```bash
   docker logs ott-api
   ```

2. Vérifier la base de données:
   ```bash
   docker exec ott-postgres psql -U postgres -d ott_data -c "\dt"
   ```

### Dashboard ne se connecte pas
1. Vérifier CORS dans `render.yaml`
2. Vérifier NEXT_PUBLIC_API_URL
3. Logs navigateur (F12)

---

## 📊 Monitoring

### Logs
```bash
# API
docker logs -f ott-api

# Dashboard
docker logs -f ott-dashboard

# Base de données
docker logs -f ott-postgres
```

### Statut
```bash
# Services
docker-compose ps

# Ressources
docker stats
```

---

## 🔄 Mise à Jour

### Production (Render)
```bash
git add .
git commit -m "Update: nouvelle version"
git push origin main
# Render déploie automatiquement
```

### Local
```bash
git pull
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

---

## 📝 Notes

- **Compilation Arduino**: nécessite ~500MB d'image Docker pour les tools ESP32
- **Base de données**: migrations automatiques au démarrage
- **Sécurité**: utiliser HTTPS en production
- **Performance**: activer le cache Redis si besoin (non inclus)

Pour toute question: ymora@free.fr
