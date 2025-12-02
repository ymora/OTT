# 📋 Plan d'Audit Complet du Projet OTT

**Date:** 2025-01-27  
**Projet:** OTT Dashboard - HAPPLYZ MEDICAL  
**Version:** 3.11  
**Objectif:** Corriger, améliorer, optimiser sans rien casser

---

## 🎯 Objectifs de l'Audit

1. **Code Mort** - Identifier et supprimer le code non utilisé
2. **Doublons** - Consolider les patterns similaires
3. **Sécurité** - Corriger les vulnérabilités potentielles
4. **Performance** - Optimiser les requêtes et le code
5. **Maintenabilité** - Améliorer la structure et la documentation

---

## 📊 Analyse Préliminaire

### Architecture Identifiée
- **Frontend:** Next.js 14 + React 18
- **Backend:** API PHP (api.php + handlers modulaires)
- **Base de données:** PostgreSQL
- **Authentification:** JWT
- **Déploiement:** GitHub Pages (frontend) + Render (backend)

### Fichiers Principaux
- `api.php` (994 lignes) - Routeur principal
- `app/dashboard/admin/database-view/page.js` (799 lignes)
- `app/dashboard/devices/page.js` (2947 lignes)
- Handlers PHP dans `api/handlers/`

---

## 🔍 AUDIT PAR CATÉGORIE

### 1️⃣ CODE MORT (Dead Code)

#### A. Fichiers à Vérifier
- [ ] **`docs/archive/`** - Archive probablement inutile
- [ ] **`docs/_next/`** - Build Next.js généré (à exclure du repo)
- [ ] **`build_output.txt`** - Fichier temporaire
- [ ] **`git_history.txt`** - Log généré (devrait être dans git)
- [ ] **`AUDIT_CONSOLIDE_2025.md`** - Ancien audit (à archiver ou supprimer)

#### B. Imports/Exports Non Utilisés
- [ ] Vérifier tous les fichiers `app/` pour imports non utilisés
- [ ] Vérifier tous les fichiers `components/` pour exports non utilisés
- [ ] Vérifier les hooks dans `hooks/` pour utilisation

#### C. Fonctions PHP Non Utilisées
- [ ] Analyser `api.php` pour fonctions définies mais jamais appelées
- [ ] Vérifier les handlers dans `api/handlers/` pour fonctions privées inutilisées

#### D. Routes/Endpoints Inutilisés
- [ ] Vérifier les routes dans `api.php` (lignes 537-994)
- [ ] Identifier les endpoints jamais appelés depuis le frontend
- [ ] Routes de debug à supprimer en production

**Actions:**
```bash
# Script à créer pour détecter le code mort
scripts/audit/find_dead_code.js
scripts/audit/find_dead_code.php
```

---

### 2️⃣ DOUBLONS ET PATTERNS SIMILAIRES

#### A. Formatage de Dates (Répété partout)
**Problème identifié:**
- Formatage de dates dupliqué dans:
  - `app/dashboard/admin/database-view/page.js` (ligne 132-141)
  - `app/dashboard/page.js` (ligne 44-53)
  - `app/dashboard/patients/page.js` (probablement)
  - `app/dashboard/users/page.js` (probablement)
  - Et probablement d'autres pages

**Solution:** Créer un utilitaire centralisé
```javascript
// lib/dateUtils.js (à créer)
export function formatDate(dateString, options = {})
export function formatDateTime(dateString)
export function formatDateOnly(dateString)
```

**Fichiers concernés:**
- `app/dashboard/admin/database-view/page.js` - ligne 132
- `app/dashboard/page.js` - ligne 44
- Tous les fichiers avec `formatDate`

#### B. Tables HTML Répétitives
**Problème identifié:**
- Structure de table HTML répétée dans:
  - `app/dashboard/admin/database-view/page.js` - `renderUsersTable()` (143-213)
  - `app/dashboard/admin/database-view/page.js` - `renderDevicesTable()` (215-288)
  - `app/dashboard/admin/database-view/page.js` - `renderPatientsTable()` (290-335)
  - `app/dashboard/patients/page.js` - Table patients
  - `app/dashboard/users/page.js` - Table users
  - `app/dashboard/commands/page.js` - Table commands (599-659)

**Solution:** Créer un composant générique de table
```javascript
// components/DataTable.js (à créer)
export default function DataTable({ columns, data, loading, emptyMessage })
```

**Fichiers concernés:**
- Tous les fichiers avec des tables HTML manuelles

#### C. Patterns de Status/Badges Répétés
**Problème identifié:**
- Définitions de couleurs de status dupliquées:
  - `app/dashboard/devices/page.js` - `commandStatusColors` (45-51)
  - `app/dashboard/commands/page.js` - `statusColors` (31-38)
  - `app/dashboard/users/page.js` - `roleColors` (49-54)
  - Et probablement d'autres

**Solution:** Créer un utilitaire centralisé
```javascript
// lib/statusUtils.js (à créer)
export const STATUS_COLORS = {
  command: { ... },
  device: { ... },
  role: { ... }
}
export function getStatusColor(type, status)
```

#### D. Logique de Filtrage/Récupération de Données
**Problème identifié:**
- Pattern similaire de récupération de données:
  - `useApiData` déjà créé ✅ (bon)
  - Mais extraction des données dupliquée:
    - `app/dashboard/admin/database-view/page.js` (41-48)
    - `app/dashboard/page.js` (36-42)
    - `app/dashboard/users/page.js` (31-32)

**Solution:** Améliorer `useApiData` pour retourner directement les arrays

#### E. Gestion d'Erreurs Répétitive
**Problème identifié:**
- Pattern try/catch similaire partout
- Messages d'erreur non standardisés
- `error_log` avec formats différents

**Solution:** Créer un wrapper d'erreur
```php
// api/helpers.php - Améliorer les fonctions existantes
function handleApiError($exception, $context = '')
```

---

### 3️⃣ SÉCURITÉ

#### A. Injections SQL Potentielles
**Problèmes identifiés:**
- ✅ Bon: Utilisation de requêtes préparées majoritairement
- ⚠️ **ATTENTION:** Construction dynamique de requêtes UPDATE/INSERT
  - `api/handlers/devices.php` ligne 346: `"UPDATE devices SET " . implode(', ', $updates)`
  - `api/handlers/devices.php` ligne 571: Construction dynamique
  - `api/handlers/devices.php` ligne 678: Construction dynamique
  - `api/handlers/auth.php` ligne 421: Construction dynamique
  - `api/handlers/notifications.php` ligne 106: Construction dynamique

**Vérifications nécessaires:**
- [ ] Valider tous les champs avant insertion dans `$updates`
- [ ] S'assurer que seuls les champs autorisés peuvent être mis à jour
- [ ] Whitelist des colonnes autorisées

**Solution:**
```php
// Fonction helper à créer
function buildUpdateQuery($pdo, $table, $data, $allowedColumns, $whereClause)
```

#### B. Authentification et Autorisation
**Points à vérifier:**
- [ ] `AUTH_DISABLED` flag - S'assurer qu'il n'est jamais en production
- [ ] Vérifier que tous les endpoints sensibles appellent `requireAuth()` et `requireAdmin()`
- [ ] Migration endpoint (`/migrate`) - Vérifier les restrictions d'accès (ligne 194)
- [ ] JWT_SECRET - Vérifier qu'il est toujours défini en production (ligne 145-156)

**Fichiers à auditer:**
- `api.php` - Routes (537-994)
- `api/handlers/auth.php` - Fonctions d'authentification

#### C. Validation des Entrées
**Points à vérifier:**
- [ ] Validation des fichiers uploadés (firmwares)
- [ ] Validation des noms de fichiers dans migrations (ligne 207-246)
- [ ] Validation des IDs numériques dans les routes
- [ ] Validation des emails, téléphones, etc.

#### D. CORS et Headers de Sécurité
**Points à vérifier:**
- [ ] Configuration CORS (ligne 20-49) - Vérifier les origines autorisées
- [ ] Headers de sécurité manquants (X-Frame-Options, CSP, etc.)
- [ ] Protection CSRF manquante

#### E. Secrets et Variables d'Environnement
**Points à vérifier:**
- [ ] `.env.example` - Vérifier qu'aucun secret n'est commité
- [ ] Vérifier que tous les secrets sont dans les variables d'environnement
- [ ] Secrets hardcodés à chercher

#### F. Gestion des Erreurs (Information Disclosure)
**Problème identifié:**
- Ligne 83, 107: Détails d'erreur exposés si `DEBUG_ERRORS=true`
- Vérifier que `DEBUG_ERRORS` est toujours `false` en production

**Solution:**
- [ ] S'assurer que `DEBUG_ERRORS=false` en production
- [ ] Ne jamais exposer les détails d'erreur aux utilisateurs non authentifiés

---

### 4️⃣ CONSOLIDATION ET OPTIMISATION

#### A. Fichiers PHP Trop Longs
**Problème:**
- `api.php` - 994 lignes (devrait être refactoré)
- `app/dashboard/devices/page.js` - 2947 lignes (trop long!)
- `app/dashboard/admin/database-view/page.js` - 799 lignes

**Solutions:**
- [ ] Diviser `api.php` en modules de routing
- [ ] Extraire la logique métier de `devices/page.js` dans des hooks/composants
- [ ] Diviser `database-view/page.js` en composants plus petits

#### B. Duplication de Logique Métier

**1. Calcul des Statistiques**
- Dupliqué dans:
  - `app/dashboard/page.js` (ligne 56-94)
  - `app/dashboard/admin/database-view/page.js` (ligne 55-96)

**Solution:** Créer un hook `useStats()`

**2. Formatage des Status**
- Multiples endroits avec logique similaire

**Solution:** Créer des helpers centralisés

**3. Gestion des Dispositifs USB**
- Logique complexe dans `app/dashboard/devices/page.js`
- Logique dans `contexts/UsbContext.js`

**Action:** Vérifier la duplication et consolider

#### C. Requêtes SQL Optimisées

**Points à vérifier:**
- [ ] Requêtes N+1 (boucles avec requêtes SQL)
- [ ] Index manquants sur colonnes fréquemment filtrées
- [ ] Jointures inutiles

**Exemples à vérifier:**
- `api/handlers/devices.php` - Requêtes dans boucles
- Endpoints list qui pourraient utiliser des jointures

#### D. Code de Debug Restant

**Problème identifié:**
- Nombreux `error_log` de debug (570 occurrences trouvées)
- `logger.debug()` partout dans le frontend
- Code de debug conditionnel mais présent partout

**Solution:**
- [ ] Créer un système de log levels
- [ ] Supprimer les logs de debug en production
- [ ] Utiliser un système de logging structuré

---

### 5️⃣ STRUCTURE ET ORGANISATION

#### A. Organisation des Handlers PHP
**Structure actuelle:**
```
api/handlers/
  - auth.php
  - devices.php (très long)
  - firmwares.php
  - firmwares/ (sous-dossier)
  - notifications.php
```

**Amélioration suggérée:**
- [ ] Diviser `devices.php` en sous-modules si > 1000 lignes
- [ ] Uniformiser la structure des handlers

#### B. Organisation des Composants React
**Structure actuelle:**
```
components/
  - configuration/ (sous-dossier)
  - ... (nombreux fichiers à la racine)
```

**Amélioration suggérée:**
- [ ] Grouper les composants par domaine
- [ ] Créer des sous-dossiers logiques

#### C. Hooks Personnalisés
**Hooks existants:**
- `useApiData` ✅
- `useAutoRefresh` ✅
- `useDebounce` ✅
- `useEntityModal` ✅
- `useEntityDelete` ✅
- `useFilter` ✅

**Vérifications:**
- [ ] S'assurer que tous les hooks sont utilisés
- [ ] Vérifier qu'il n'y a pas de duplication

---

## 🎯 PLAN D'ACTION PRIORISÉ

### Phase 1: SÉCURITÉ (CRITIQUE) ⚠️

1. **Audit SQL Injection**
   - [ ] Valider toutes les constructions dynamiques de requêtes
   - [ ] Créer une fonction helper sécurisée pour UPDATE/INSERT
   - [ ] Tester avec des payloads malveillants

2. **Authentification**
   - [ ] Vérifier que `AUTH_DISABLED` n'est jamais en production
   - [ ] Auditer tous les endpoints pour vérifier `requireAuth()`
   - [ ] Vérifier la gestion du JWT_SECRET

3. **Validation des Entrées**
   - [ ] Créer des validators pour tous les inputs
   - [ ] Valider les fichiers uploadés
   - [ ] Valider les IDs numériques

4. **Headers de Sécurité**
   - [ ] Ajouter X-Frame-Options
   - [ ] Ajouter Content-Security-Policy
   - [ ] Ajouter X-Content-Type-Options

**Durée estimée:** 2-3 jours

---

### Phase 2: CONSOLIDATION (IMPORTANT) 🔄

1. **Créer les Utilitaires Manquants**
   - [ ] `lib/dateUtils.js` - Formatage de dates
   - [ ] `lib/statusUtils.js` - Couleurs et badges de status
   - [ ] `components/DataTable.js` - Table générique
   - [ ] `hooks/useStats.js` - Calcul de statistiques

2. **Refactoriser les Fichiers Longs**
   - [ ] Diviser `api.php` en modules de routing
   - [ ] Extraire la logique de `devices/page.js` dans des hooks
   - [ ] Diviser `database-view/page.js` en composants

3. **Supprimer les Doublons**
   - [ ] Remplacer tous les `formatDate` par l'utilitaire
   - [ ] Remplacer les tables HTML par `DataTable`
   - [ ] Consolider les définitions de couleurs

**Durée estimée:** 3-4 jours

---

### Phase 3: CODE MORT (MOYEN) 🧹

1. **Identifier le Code Mort**
   - [ ] Créer un script pour détecter les imports non utilisés
   - [ ] Identifier les fonctions PHP non appelées
   - [ ] Identifier les routes jamais utilisées

2. **Nettoyer**
   - [ ] Supprimer les fichiers inutiles (archive, build, etc.)
   - [ ] Supprimer les imports non utilisés
   - [ ] Supprimer les fonctions non utilisées

**Durée estimée:** 1-2 jours

---

### Phase 4: OPTIMISATION (MOYEN) ⚡

1. **Optimiser les Requêtes SQL**
   - [ ] Identifier les requêtes N+1
   - [ ] Ajouter les index manquants
   - [ ] Optimiser les jointures

2. **Optimiser le Frontend**
   - [ ] Lazy loading des composants lourds
   - [ ] Mémorisation des calculs coûteux (déjà fait avec useMemo ✅)
   - [ ] Optimiser les re-renders

3. **Système de Logging**
   - [ ] Créer un système de log levels
   - [ ] Supprimer les logs de debug en production
   - [ ] Centraliser la configuration de logging

**Durée estimée:** 2-3 jours

---

### Phase 5: DOCUMENTATION (FAIBLE) 📚

1. **Documentation du Code**
   - [ ] Ajouter JSDoc aux fonctions importantes
   - [ ] Documenter les hooks personnalisés
   - [ ] Documenter les handlers PHP

2. **Documentation Technique**
   - [ ] Mettre à jour le README
   - [ ] Documenter l'architecture
   - [ ] Documenter les patterns utilisés

**Durée estimée:** 1 jour

---

## 📝 CHECKLIST DE VALIDATION

Avant de considérer l'audit terminé:

### Tests
- [ ] Tous les tests passent (npm test)
- [ ] Tests manuels de toutes les fonctionnalités principales
- [ ] Tests de sécurité (SQL injection, XSS, etc.)

### Qualité du Code
- [ ] Aucune erreur de linter (npm run lint)
- [ ] Aucun warning de build (npm run build)
- [ ] Code review par un pair

### Sécurité
- [ ] Audit de sécurité complet
- [ ] Vérification des secrets et variables d'environnement
- [ ] Headers de sécurité ajoutés

### Performance
- [ ] Temps de chargement vérifiés
- [ ] Requêtes SQL optimisées
- [ ] Bundle size vérifié

---

## 🔧 OUTILS ET SCRIPTS RECOMMANDÉS

### Scripts à Créer

1. **`scripts/audit/find_dead_code.js`**
   - Analyse les imports non utilisés
   - Détecte les exports non utilisés

2. **`scripts/audit/find_duplicates.js`**
   - Détecte les patterns similaires
   - Identifie le code dupliqué

3. **`scripts/audit/security_check.php`**
   - Vérifie les requêtes SQL non préparées
   - Vérifie les validations manquantes

4. **`scripts/audit/find_long_files.sh`**
   - Identifie les fichiers trop longs
   - Suggère des points de refactoring

---

## 📊 MÉTRIQUES DE SUCCÈS

### Avant l'Audit
- Fichiers > 1000 lignes: **3+**
- Duplications de code: **Nombreuses**
- Code mort estimé: **5-10%**
- Vulnérabilités de sécurité: **Plusieurs potentielles**

### Objectifs Après l'Audit
- Fichiers > 1000 lignes: **0**
- Duplications de code: **< 5%**
- Code mort: **< 1%**
- Vulnérabilités de sécurité: **0 critique**

---

## 🚨 RISQUES ET PRÉCAUTIONS

### Risques Identifiés

1. **Casser des Fonctionnalités Existantes**
   - ✅ Précaution: Tests complets avant/après
   - ✅ Précaution: Refactoring progressif (pas tout d'un coup)

2. **Régression de Performance**
   - ✅ Précaution: Mesurer les performances avant/après
   - ✅ Précaution: Tester avec des données réalistes

3. **Problèmes de Déploiement**
   - ✅ Précaution: Tester en staging avant production
   - ✅ Précaution: Rollback plan préparé

### Points d'Attention

- ⚠️ **NE PAS modifier** les endpoints API sans vérifier le frontend
- ⚠️ **NE PAS supprimer** de code sans être sûr qu'il n'est pas utilisé
- ⚠️ **TOUJOURS tester** après chaque modification

---

## 📅 CALENDRIER SUGGÉRÉ

### Semaine 1: Sécurité
- Jour 1-2: Audit SQL et authentification
- Jour 3-4: Validation et headers de sécurité
- Jour 5: Tests et validation

### Semaine 2: Consolidation
- Jour 1-2: Création des utilitaires
- Jour 3-4: Refactoring des fichiers longs
- Jour 5: Suppression des doublons

### Semaine 3: Nettoyage et Optimisation
- Jour 1-2: Code mort
- Jour 3-4: Optimisation SQL et frontend
- Jour 5: Documentation

---

## ✅ PROCHAINES ÉTAPES IMMÉDIATES

1. **Créer une branche de travail**
   ```bash
   git checkout -b audit/refactoring-2025
   ```

2. **Commencer par la Phase 1 (Sécurité)**
   - Priorité absolue avant tout autre changement

3. **Documenter chaque modification**
   - Commit descriptif
   - Notes de changements

4. **Tester régulièrement**
   - Après chaque modification importante
   - Tests automatisés si possible

---

**Document créé le:** 2025-01-27  
**Dernière mise à jour:** 2025-01-27  
**Statut:** 📋 Plan créé - Prêt pour exécution

