# 🚀 Améliorations v3.11

## ✅ Pagination

Tous les endpoints de liste supportent maintenant la pagination :

### Endpoints avec pagination
- `GET /api.php/devices` - Liste des dispositifs
- `GET /api.php/alerts` - Liste des alertes
- `GET /api.php/commands` - Liste des commandes
- `GET /api.php/patients` - Liste des patients (déjà existant)
- `GET /api.php/users` - Liste des utilisateurs (déjà existant)

### Paramètres de pagination
- `limit` : Nombre d'éléments par page (défaut: 100, max: 500)
- `offset` : Décalage pour la pagination (défaut: 0)
- `page` : Numéro de page (défaut: 1, calcule automatiquement l'offset)

### Exemple de réponse
```json
{
  "success": true,
  "devices": [...],
  "pagination": {
    "total": 150,
    "limit": 100,
    "offset": 0,
    "page": 1,
    "total_pages": 2,
    "has_next": true,
    "has_prev": false
  }
}
```

## ✅ Cache (Redis optionnel)

Système de cache avec support Redis optionnel et fallback mémoire.

### Configuration
Variables d'environnement (optionnelles) :
- `REDIS_HOST` : Hôte Redis (défaut: localhost)
- `REDIS_PORT` : Port Redis (défaut: 6379)
- `REDIS_PASSWORD` : Mot de passe Redis (optionnel)

### Utilisation
Le cache est automatiquement utilisé pour :
- Liste des dispositifs (TTL: 30 secondes)
- Autres endpoints fréquemment appelés

### Fallback
Si Redis n'est pas disponible, le système utilise un cache en mémoire automatiquement.

## ✅ Monitoring avec Sentry

Sentry est intégré pour le monitoring des erreurs en production.

### Configuration
Variables d'environnement :
- `NEXT_PUBLIC_SENTRY_DSN` : DSN Sentry (obligatoire pour activer)
- `SENTRY_ORG` : Organisation Sentry (optionnel)
- `SENTRY_PROJECT` : Projet Sentry (optionnel)

### Fonctionnalités
- Capture automatique des erreurs frontend et backend
- Session Replay (10% des sessions)
- Performance monitoring (10% des transactions en production)
- Source maps automatiques

### Activation
1. Créer un compte sur [sentry.io](https://sentry.io)
2. Créer un projet Next.js
3. Ajouter `NEXT_PUBLIC_SENTRY_DSN` dans les variables d'environnement
4. Redéployer

## ✅ Documentation API OpenAPI/Swagger

Documentation OpenAPI 3.0 disponible.

### Accès
- **Endpoint** : `GET /api.php/docs/openapi.json`
- **Format** : OpenAPI 3.0 (JSON)

### Visualisation
Utiliser un outil comme [Swagger UI](https://swagger.io/tools/swagger-ui/) ou [Postman](https://www.postman.com/) pour visualiser l'API.

### Exemple
```bash
curl https://ott-jbln.onrender.com/api.php/docs/openapi.json
```

## ✅ Suivi du temps amélioré

Le script de suivi du temps inclut maintenant :
- **Commits locaux** : Analyse du `git reflog` pour inclure les commits non pushés
- **Détection automatique** : Distinction entre commits distants et locaux
- **Déduplication** : Évite de compter deux fois le même commit

### Utilisation
```powershell
.\scripts\generate_time_tracking.ps1
```

Le script génère automatiquement `SUIVI_TEMPS_FACTURATION.md` avec :
- Commits distants (git log)
- Commits locaux (git reflog)
- Temps estimé par jour
- Catégorisation des commits

### Note sur Cursor
Le script détecte automatiquement les commits générés avec Cursor/AI en analysant les messages de commit. Pour un suivi plus précis de l'utilisation de Cursor, vous pouvez :
1. Ajouter un tag dans vos commits : `[Cursor]` ou `[AI]`
2. Le script catégorisera automatiquement ces commits

---

**Version** : 3.11  
**Date** : 2025-12-01

