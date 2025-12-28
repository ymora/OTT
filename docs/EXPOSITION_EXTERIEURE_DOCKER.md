# 🌐 Exposition du Site à l'Extérieur avec Docker Local

Ce guide explique comment exposer votre site Docker local à l'extérieur de votre réseau local.

## 📋 Vue d'ensemble

Votre configuration Docker actuelle :
- **Dashboard Next.js** : Port `3000` (http://localhost:3000)
- **API PHP** : Port `8000` (http://localhost:8000)
- **PostgreSQL** : Port `5432` (⚠️ NE PAS exposer à l'extérieur)

---

## 🚀 Solution 1 : ngrok (Recommandé - Le plus simple)

**Avantages** :
- ✅ Configuration en 2 minutes
- ✅ HTTPS automatique
- ✅ URL publique gratuite
- ✅ Pas besoin de modifier le routeur
- ✅ Sécurisé (tunnel chiffré)

**Inconvénients** :
- ⚠️ URL change à chaque redémarrage (gratuit)
- ⚠️ Limite de bande passante (gratuit)

### Installation et utilisation

1. **Télécharger ngrok** : https://ngrok.com/download
2. **S'inscrire** (gratuit) et récupérer votre token
3. **Configurer ngrok** :
```powershell
# Dans PowerShell
ngrok config add-authtoken VOTRE_TOKEN_ICI
```

4. **Exposer le dashboard** :
```powershell
# Terminal 1 : Démarrer Docker
docker-compose up

# Terminal 2 : Exposer le port 3000
ngrok http 3000
```

5. **Résultat** : Vous obtenez une URL comme `https://abc123.ngrok.io` qui pointe vers votre dashboard local.

6. **Pour exposer aussi l'API** (si nécessaire) :
```powershell
# Terminal 3 : Exposer le port 8000
ngrok http 8000
```

### Configuration CORS pour ngrok

Si vous utilisez ngrok, vous devez mettre à jour `CORS_ALLOWED_ORIGINS` dans `docker-compose.yml` :

```yaml
CORS_ALLOWED_ORIGINS: http://localhost:3000,http://localhost:3003,https://abc123.ngrok.io
```

**Note** : Remplacez `abc123.ngrok.io` par votre URL ngrok réelle.

---

## 🔒 Solution 2 : Cloudflare Tunnel (cloudflared) - Gratuit et Professionnel

**Avantages** :
- ✅ Gratuit et illimité
- ✅ HTTPS automatique
- ✅ URL personnalisée possible (avec domaine Cloudflare)
- ✅ Pas besoin de modifier le routeur
- ✅ Très sécurisé
- ✅ Pas de limite de bande passante

**Inconvénients** :
- ⚠️ Configuration un peu plus complexe que ngrok

### Installation et utilisation

1. **Télécharger cloudflared** : https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/

2. **Créer un tunnel** :
```powershell
# S'authentifier
cloudflared tunnel login

# Créer un tunnel
cloudflared tunnel create ott-tunnel

# Configurer le tunnel
cloudflared tunnel route dns ott-tunnel ott-votre-domaine.com
```

3. **Créer un fichier de configuration** `~/.cloudflared/config.yml` :
```yaml
tunnel: ott-tunnel
credentials-file: C:\Users\ymora\.cloudflared\<tunnel-id>.json

ingress:
  - hostname: ott-votre-domaine.com
    service: http://localhost:3000
  - hostname: api-ott-votre-domaine.com
    service: http://localhost:8000
  - service: http_status:404
```

4. **Démarrer le tunnel** :
```powershell
cloudflared tunnel run ott-tunnel
```

---

## 🌍 Solution 3 : Port Forwarding sur le Routeur (Accès Direct)

**Avantages** :
- ✅ Accès direct (pas de tunnel)
- ✅ Contrôle total
- ✅ Pas de limite de bande passante

**Inconvénients** :
- ⚠️ Nécessite d'accéder au routeur
- ⚠️ Exposition directe à Internet (sécurité à renforcer)
- ⚠️ Nécessite une IP publique statique ou un service DDNS
- ⚠️ Nécessite un certificat SSL (Let's Encrypt)

### Configuration

1. **Trouver l'IP locale de votre PC** :
```powershell
ipconfig
# Notez l'adresse IPv4 (ex: 192.168.1.100)
```

2. **Configurer le routeur** :
   - Accéder à l'interface admin du routeur (généralement 192.168.1.1)
   - Aller dans "Port Forwarding" ou "Virtual Server"
   - Rediriger :
     - Port externe `80` → `192.168.1.100:3000` (Dashboard)
     - Port externe `443` → `192.168.1.100:3000` (Dashboard HTTPS)
     - Port externe `8000` → `192.168.1.100:8000` (API) - Optionnel

3. **Configurer un reverse proxy Nginx** (recommandé pour HTTPS) :

Créer un service Nginx dans `docker-compose.yml` :

```yaml
  nginx:
    image: nginx:alpine
    container_name: ott-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
    depends_on:
      - dashboard
      - api
    networks:
      - ott-network
```

4. **Créer `nginx/nginx.conf`** :
```nginx
events {
    worker_connections 1024;
}

http {
    upstream dashboard {
        server dashboard:3000;
    }
    
    upstream api {
        server api:80;
    }

    server {
        listen 80;
        server_name votre-domaine.com;
        
        # Redirection HTTPS
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name votre-domaine.com;

        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;

        # Dashboard
        location / {
            proxy_pass http://dashboard;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # API
        location /api.php {
            proxy_pass http://api;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
```

5. **Obtenir un certificat SSL** avec Let's Encrypt (certbot) :
```powershell
# Installer certbot
# Puis générer le certificat
certbot certonly --standalone -d votre-domaine.com
```

---

## 🔐 Solution 4 : Tailscale (VPN Mesh) - Le plus sécurisé

**Avantages** :
- ✅ Très sécurisé (VPN mesh)
- ✅ Accès comme si vous étiez sur le réseau local
- ✅ Gratuit pour usage personnel
- ✅ Pas besoin de modifier le routeur
- ✅ HTTPS automatique

**Inconvénients** :
- ⚠️ Nécessite d'installer Tailscale sur tous les appareils qui veulent accéder

### Installation

1. **Installer Tailscale** sur votre PC : https://tailscale.com/download
2. **Créer un compte** et se connecter
3. **Installer Tailscale** sur les appareils qui veulent accéder au site
4. **Accéder au site** via l'IP Tailscale de votre PC (ex: `100.x.x.x:3000`)

---

## 📊 Comparaison des Solutions

| Solution | Complexité | Sécurité | Coût | Performance | Recommandation |
|----------|------------|----------|------|-------------|----------------|
| **ngrok** | ⭐ Très simple | ⭐⭐⭐ Bonne | Gratuit (limité) | ⭐⭐⭐ Bonne | ✅ **Développement/Test** |
| **Cloudflare Tunnel** | ⭐⭐ Simple | ⭐⭐⭐⭐⭐ Excellente | Gratuit | ⭐⭐⭐⭐⭐ Excellente | ✅✅ **Production** |
| **Port Forwarding** | ⭐⭐⭐ Complexe | ⭐⭐ Moyenne | Gratuit | ⭐⭐⭐⭐⭐ Excellente | ⚠️ Nécessite Nginx + SSL |
| **Tailscale** | ⭐⭐ Simple | ⭐⭐⭐⭐⭐ Excellente | Gratuit | ⭐⭐⭐⭐ Très bonne | ✅ **Accès privé** |

---

## 🎯 Recommandation selon l'usage

### 🧪 **Pour tester rapidement** (développement)
→ **ngrok** : Le plus rapide à configurer

### 🏢 **Pour un usage professionnel** (production)
→ **Cloudflare Tunnel** : Gratuit, sécurisé, performant

### 🏠 **Pour un accès privé** (équipe restreinte)
→ **Tailscale** : VPN sécurisé, accès comme en local

### 🌐 **Pour un accès public direct** (site public)
→ **Port Forwarding + Nginx + Let's Encrypt** : Contrôle total

---

## ⚠️ Sécurité - Points Importants

1. **Ne JAMAIS exposer PostgreSQL** (port 5432) à l'extérieur
2. **Toujours utiliser HTTPS** en production
3. **Mettre à jour CORS_ALLOWED_ORIGINS** dans `docker-compose.yml` avec les nouvelles URLs
4. **Changer les mots de passe par défaut** (POSTGRES_PASSWORD, JWT_SECRET)
5. **Utiliser des variables d'environnement** pour les secrets (fichier `.env`)
6. **Activer le firewall Windows** et limiter les ports ouverts
7. **Surveiller les logs** pour détecter les tentatives d'intrusion

---

## 🔧 Configuration Docker pour Exposition Externe

### Mise à jour de `docker-compose.yml` pour CORS

Si vous exposez le site, mettez à jour `CORS_ALLOWED_ORIGINS` :

```yaml
environment:
  CORS_ALLOWED_ORIGINS: http://localhost:3000,http://localhost:3003,https://votre-url-externe.com
```

### Variables d'environnement pour le Dashboard

Si vous exposez le dashboard, vous devrez peut-être mettre à jour `NEXT_PUBLIC_API_URL` :

```yaml
environment:
  NEXT_PUBLIC_API_URL: https://api-votre-url-externe.com
```

---

## 📝 Exemple de Script PowerShell pour ngrok

Créer `scripts/expose-ngrok.ps1` :

```powershell
# Script pour exposer le site avec ngrok
param(
    [string]$Port = "3000"
)

Write-Host "🚀 Démarrage de ngrok pour le port $Port..." -ForegroundColor Green

# Vérifier que ngrok est installé
if (-not (Get-Command ngrok -ErrorAction SilentlyContinue)) {
    Write-Host "❌ ngrok n'est pas installé. Téléchargez-le depuis https://ngrok.com/download" -ForegroundColor Red
    exit 1
}

# Vérifier que Docker est en cours d'exécution
$dockerRunning = docker ps 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Docker n'est pas en cours d'exécution. Démarrez d'abord docker-compose up" -ForegroundColor Red
    exit 1
}

# Démarrer ngrok
Write-Host "✅ ngrok démarre sur le port $Port..." -ForegroundColor Green
Write-Host "📋 L'URL publique sera affichée ci-dessous" -ForegroundColor Yellow
Write-Host ""

ngrok http $Port
```

**Utilisation** :
```powershell
# Exposer le dashboard (port 3000)
.\scripts\expose-ngrok.ps1 -Port 3000

# Exposer l'API (port 8000)
.\scripts\expose-ngrok.ps1 -Port 8000
```

---

## 🆘 Dépannage

### Le site ne s'affiche pas depuis l'extérieur

1. **Vérifier que Docker est en cours d'exécution** :
```powershell
docker ps
```

2. **Vérifier que les ports sont bien exposés** :
```powershell
netstat -an | findstr "3000"
netstat -an | findstr "8000"
```

3. **Vérifier le firewall Windows** :
```powershell
# Autoriser les ports dans le firewall
New-NetFirewallRule -DisplayName "OTT Dashboard" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "OTT API" -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow
```

4. **Vérifier les logs Docker** :
```powershell
docker-compose logs dashboard
docker-compose logs api
```

### Erreurs CORS

Si vous avez des erreurs CORS, mettez à jour `CORS_ALLOWED_ORIGINS` dans `docker-compose.yml` avec toutes les URLs autorisées.

---

## 📚 Ressources

- **ngrok** : https://ngrok.com/docs
- **Cloudflare Tunnel** : https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/
- **Tailscale** : https://tailscale.com/kb/
- **Let's Encrypt** : https://letsencrypt.org/

---

**Note** : Pour un usage en production, nous recommandons fortement **Cloudflare Tunnel** ou un **VPS/Cloud** (comme Render, que vous utilisez déjà pour l'API de production).







