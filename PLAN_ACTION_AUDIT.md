# 🎯 PLAN D'ACTION - AUDIT OTT

Basé sur l'audit complet réalisé le 2025-01-XX

---

## 🔴 ACTIONS CRITIQUES (À faire immédiatement)

### 1. Sécuriser la validation des fichiers de migration
**Fichier**: `api.php` ligne 204  
**Risque**: Injection de chemin de fichier  
**Priorité**: CRITIQUE

```php
// Code actuel (vulnérable)
$migrationFile = $_POST['file'] ?? $_GET['file'] ?? 'schema.sql';
runSqlFile($pdo, $migrationFile);

// Code sécurisé
$allowedFiles = ['schema.sql'];
$migrationFile = $_POST['file'] ?? $_GET['file'] ?? 'schema.sql';

// Validation stricte
if (!in_array($migrationFile, $allowedFiles)) {
    // Vérifier si c'est un fichier de migration valide
    if (!preg_match('/^migration_[a-z0-9_]+\.sql$/', $migrationFile)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid migration file']);
        return;
    }
    // Vérifier que le fichier existe dans sql/
    $filePath = SQL_BASE_DIR . '/' . $migrationFile;
    if (!file_exists($filePath) || !is_readable($filePath)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Migration file not found']);
        return;
    }
    // Vérifier que le chemin ne contient pas de .. (path traversal)
    $realPath = realpath($filePath);
    $basePath = realpath(SQL_BASE_DIR);
    if (strpos($realPath, $basePath) !== 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid file path']);
        return;
    }
}
```

**Temps estimé**: 30 minutes  
**Impact**: Sécurité critique

---

### 2. Implémenter le Rate Limiting sur /auth/login
**Fichier**: `api/handlers/auth.php`  
**Risque**: Attaques par force brute  
**Priorité**: CRITIQUE

**Solution 1 - Simple (fichier)**
```php
function checkRateLimit($email, $maxAttempts = 5, $windowMinutes = 5) {
    $lockFile = sys_get_temp_dir() . '/ott_login_' . md5($email) . '.lock';
    $attempts = [];
    
    if (file_exists($lockFile)) {
        $attempts = json_decode(file_get_contents($lockFile), true) ?: [];
        // Nettoyer les tentatives anciennes
        $attempts = array_filter($attempts, function($time) use ($windowMinutes) {
            return time() - $time < ($windowMinutes * 60);
        });
    }
    
    if (count($attempts) >= $maxAttempts) {
        return false; // Trop de tentatives
    }
    
    $attempts[] = time();
    file_put_contents($lockFile, json_encode($attempts));
    return true;
}

// Dans handleLogin()
if (!checkRateLimit($email)) {
    auditLog('user.login_rate_limited', 'user', null, null, ['email' => $email]);
    http_response_code(429);
    echo json_encode(['success' => false, 'error' => 'Too many login attempts. Please try again later.']);
    return;
}
```

**Solution 2 - Avancée (Redis - si disponible)**
```php
// Utiliser Redis pour un rate limiting distribué
// Plus robuste pour plusieurs serveurs
```

**Temps estimé**: 1-2 heures  
**Impact**: Sécurité critique

---

## 🟡 ACTIONS IMPORTANTES (À planifier cette semaine)

### 3. Augmenter la couverture de tests
**Priorité**: IMPORTANT  
**Objectif**: 60%+ de couverture

**Tests à ajouter**:
- [ ] Tests unitaires pour `api/handlers/auth.php`
- [ ] Tests unitaires pour `api/handlers/devices.php`
- [ ] Tests d'intégration pour le flux login → dashboard
- [ ] Tests E2E avec Playwright (3-5 scénarios critiques)

**Temps estimé**: 2-3 jours  
**Impact**: Qualité, maintenabilité

---

### 4. Documenter l'API avec OpenAPI
**Priorité**: IMPORTANT

**Actions**:
1. Créer `api/openapi.yaml` avec tous les endpoints
2. Générer la documentation interactive (Swagger UI)
3. Intégrer dans le README

**Outils recommandés**:
- `swagger-php` pour annotations PHP
- `swagger-ui` pour l'interface

**Temps estimé**: 1 jour  
**Impact**: Développement, intégration

---

### 5. Implémenter un système de monitoring
**Priorité**: IMPORTANT

**Options**:
1. **Sentry** (recommandé)
   - Erreurs JavaScript et PHP
   - Performance monitoring
   - Gratuit jusqu'à 5K events/mois

2. **Logtail** (alternative)
   - Centralisation des logs
   - Recherche avancée

**Temps estimé**: 2-3 heures  
**Impact**: Observabilité, debugging

---

## 🟢 AMÉLIORATIONS (Nice to have)

### 6. Migration progressive vers TypeScript
**Priorité**: AMÉLIORATION

**Stratégie**:
1. Commencer par les nouveaux fichiers
2. Migrer les fichiers critiques (AuthContext, API calls)
3. Configurer `tsconfig.json` strict

**Temps estimé**: 1-2 semaines (progressive)  
**Impact**: Maintenabilité, détection d'erreurs

---

### 7. Optimiser les performances
**Priorité**: AMÉLIORATION

**Actions**:
- [ ] Analyser les bundles avec `@next/bundle-analyzer`
- [ ] Implémenter lazy loading pour LeafletMap, Chart
- [ ] Optimiser les requêtes N+1 dans `api/handlers/devices.php`
- [ ] Ajouter cache HTTP pour assets statiques

**Temps estimé**: 1-2 jours  
**Impact**: Performance utilisateur

---

### 8. Automatiser CI/CD
**Priorité**: AMÉLIORATION

**Actions**:
- [ ] GitHub Actions pour tests automatiques
- [ ] Linting automatique (ESLint, PHP CS Fixer)
- [ ] Security scanning (npm audit, Snyk)
- [ ] Déploiement automatique sur merge main

**Temps estimé**: 1 jour  
**Impact**: Qualité, vitesse de déploiement

---

## 📋 CHECKLIST DE VALIDATION

Avant de considérer le projet "production-ready", vérifier :

### Sécurité
- [ ] Validation des entrées sécurisée (migration files)
- [ ] Rate limiting sur /auth/login
- [ ] Tous les secrets en variables d'environnement
- [ ] CORS configuré correctement en production
- [ ] `DEBUG_ERRORS=false` en production

### Tests
- [ ] Couverture de tests > 60%
- [ ] Tests critiques passent (login, devices, firmwares)
- [ ] Tests E2E pour flux principaux

### Documentation
- [ ] README à jour
- [ ] API documentée (OpenAPI)
- [ ] Changelog maintenu

### Monitoring
- [ ] Système de monitoring configuré
- [ ] Alertes configurées (erreurs critiques)
- [ ] Logs centralisés

---

## 📊 ESTIMATION TOTALE

| Priorité | Temps Estimé | Impact |
|----------|--------------|--------|
| **Critique** | 2-3 heures | 🔴 Sécurité |
| **Important** | 4-5 jours | 🟡 Qualité |
| **Amélioration** | 2-3 semaines | 🟢 Optimisation |

**Total**: ~3-4 semaines pour tout implémenter

---

## 🎯 PROCHAINES ÉTAPES

1. **Cette semaine**: Actions critiques (1-2)
2. **Semaine prochaine**: Actions importantes (3-5)
3. **Mois prochain**: Améliorations (6-8)

---

*Document généré automatiquement - HAPPLYZ MEDICAL SAS*

