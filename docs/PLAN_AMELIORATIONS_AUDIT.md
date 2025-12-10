# Plan d'Améliorations Suite à l'Audit

## 📊 Résumé de l'Audit
- **Score global** : 7.4/10
- **Problèmes critiques** : 8
- **Avertissements** : 9

## 🎯 Améliorations Prioritaires

### 1. ⚠️ Index SQL Manquants (CRITIQUE - Performance)
**Problème** : Seulement 10 index dans `schema.sql` pour une base avec de nombreuses tables.

**Impact** : Requêtes lentes sur grandes tables (devices, measurements, logs).

**Actions** :
- [ ] Ajouter index sur `devices.sim_iccid` (déjà UNIQUE, mais vérifier)
- [ ] Ajouter index sur `devices.patient_id` (JOIN fréquent)
- [ ] Ajouter index sur `devices.last_seen` (filtres fréquents)
- [ ] Ajouter index sur `measurements.device_id` (JOIN fréquent)
- [ ] Ajouter index sur `measurements.timestamp` (requêtes par date)
- [ ] Ajouter index sur `device_commands.device_id` (requêtes fréquentes)
- [ ] Ajouter index sur `device_commands.status` (filtres)
- [ ] Ajouter index composite sur `measurements(device_id, timestamp)` pour requêtes historiques
- [ ] Ajouter index sur `alerts.device_id` et `alerts.status`
- [ ] Ajouter index sur `audit_logs.user_id` et `audit_logs.created_at`

**Fichier** : `sql/migration_add_performance_indexes.sql`

### 2. ⚠️ Pagination API Incomplète (CRITIQUE - Scalabilité)
**Problème** : Pagination limitée à certains endpoints, pas systématique.

**Impact** : Risque de timeout/erreurs mémoire avec beaucoup de données.

**Actions** :
- [ ] Vérifier que `/api.php/devices` utilise pagination (limite par défaut)
- [ ] Vérifier que `/api.php/measurements` utilise pagination
- [ ] Vérifier que `/api.php/alerts` utilise pagination
- [ ] Vérifier que `/api.php/logs` utilise pagination
- [ ] Ajouter pagination à `/api.php/firmwares` si manquante
- [ ] Standardiser format réponse pagination : `{ data, pagination: { total, limit, offset, has_more } }`
- [ ] Ajouter pagination côté frontend (boutons précédent/suivant)

**Fichiers** : 
- `api/handlers/devices/crud.php`
- `api/handlers/devices/measurements.php`
- `api/handlers/devices/alerts.php`
- `api/handlers/devices/logs.php`
- `api/handlers/firmwares/crud.php`

### 3. ⚠️ ErrorBoundary Manquants (MOYEN - Robustesse)
**Problème** : Pas de ErrorBoundary React dans les composants (seulement `app/error.js` Next.js).

**Impact** : Erreurs non capturées peuvent casser toute l'interface.

**Actions** :
- [ ] Créer composant `ErrorBoundary.js` réutilisable
- [ ] Envelopper sections critiques : Dashboard, Modals, Forms
- [ ] Ajouter ErrorBoundary autour de `LeafletMap` (composant externe)
- [ ] Ajouter ErrorBoundary autour de composants de configuration
- [ ] Logger les erreurs capturées pour debugging

**Fichier** : `components/ErrorBoundary.js`

### 4. ⚠️ Documentation HTML Manquante (MOYEN - Documentation)
**Problème** : Fichiers HTML de documentation manquants selon l'audit.

**Actions** :
- [ ] Générer `public/docs/DOCUMENTATION_PRESENTATION.html`
- [ ] Générer `public/docs/DOCUMENTATION_DEVELOPPEURS.html`
- [ ] Générer `public/docs/DOCUMENTATION_COMMERCIALE.html`
- [ ] Vérifier que `public/SUIVI_TEMPS_FACTURATION.md` est généré correctement

**Fichiers** : Scripts de génération dans `scripts/deploy/`

### 5. ✅ Optimisations React (DÉJÀ BON)
**Statut** : 28 useMemo/useCallback dans app/, 77 dans components/ - **Bien optimisé**

**Actions** : Aucune action nécessaire, déjà bien fait.

### 6. ⚠️ Tests Insuffisants (MOYEN - Qualité)
**Problème** : 9 fichiers de tests seulement (l'audit disait 0, mais fichiers existent).

**Actions** :
- [ ] Ajouter tests pour hooks critiques (`useApiData`, `useEntityPage`)
- [ ] Ajouter tests pour composants critiques (`DeviceModal`, `UserPatientModal`)
- [ ] Ajouter tests d'intégration pour workflows complets
- [ ] Ajouter tests E2E pour fonctionnalités critiques (authentification, OTA)

**Fichiers** : `__tests__/hooks/`, `__tests__/components/`, `__tests__/integration/`

### 7. ⚠️ Cache API (MOYEN - Performance)
**Problème** : Cache simple en mémoire dans `useApiData`, pas de cache persistant.

**Actions** :
- [ ] Évaluer si localStorage cache serait bénéfique
- [ ] Ajouter cache pour données peu changeantes (roles, permissions)
- [ ] Implémenter invalidation cache intelligente
- [ ] Ajouter cache côté serveur (headers Cache-Control) pour données statiques

**Fichier** : `hooks/useApiData.js`

## 📋 Plan d'Exécution

### Phase 1 : Performance (Priorité Haute)
1. Ajouter index SQL (1-2h)
2. Vérifier/améliorer pagination API (2-3h)

### Phase 2 : Robustesse (Priorité Moyenne)
3. Ajouter ErrorBoundary (1h)
4. Améliorer gestion erreurs (1h)

### Phase 3 : Qualité (Priorité Basse)
5. Ajouter tests (2-3h)
6. Générer documentation HTML (1h)
7. Améliorer cache (1-2h)

## 🎯 Objectif
**Score cible** : 9.0/10 (au lieu de 7.4/10)

**Gains attendus** :
- Performance : +1.5 points (index SQL + pagination)
- Robustesse : +0.5 points (ErrorBoundary)
- Qualité : +0.5 points (tests)
- Documentation : +0.1 points (HTML)



