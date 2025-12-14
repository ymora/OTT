# 📋 Plan de Corrections Complètes - 2025-12-13

**Date** : 2025-12-13  
**Objectif** : Corriger tous les problèmes identifiés par l'audit

## 🎯 Tâches à Réaliser

### 1. ✅ Nettoyer la Documentation
- [x] Vérifier les fichiers HTML de documentation
- [ ] Supprimer l'historique dans DOCUMENTATION_DEVELOPPEURS.html
- [ ] Rationaliser les fichiers MD (10 fichiers identifiés)
- [ ] Garder uniquement la roadmap actuelle

### 2. ⏳ Optimiser les Requêtes SQL et Ajouter Pagination API
- [ ] Identifier les requêtes SQL N+1
- [ ] Optimiser avec JOIN ou requêtes groupées
- [ ] Ajouter pagination aux 26 endpoints API non paginés
- [ ] Vérifier les index SQL

### 3. ⏳ Refactoriser la Duplication de Code
- [ ] Identifier les 51 fonctions dupliquées
- [ ] Créer des hooks/utilitaires réutilisables
- [ ] Refactoriser les composants utilisant ces fonctions
- [ ] Réduire useState (189 occurrences), useEffect (87), appels API (77), try/catch (201)

### 4. ⏳ Diviser les Fichiers Volumineux
- [ ] **api/handlers/firmwares/compile.php** (1614 lignes)
  - Extraire : SSE functions, cleanup, compilation logic
- [ ] **api/handlers/notifications.php** (1086 lignes)
  - Extraire : queue management, sending logic, preferences
- [ ] **components/configuration/UsbStreamingTab.js** (2000 lignes)
  - Extraire : sous-composants, hooks personnalisés
- [ ] **contexts/UsbContext.js** (2000 lignes)
  - Extraire : sous-contextes spécialisés

## 📊 Fichiers Volumineux Identifiés

| Fichier | Lignes | Action |
|---------|--------|--------|
| `api/handlers/firmwares/compile.php` | 1614 | Diviser en 3-4 modules |
| `api/handlers/notifications.php` | 1086 | Diviser en 3 modules |
| `components/configuration/UsbStreamingTab.js` | 2000 | Extraire sous-composants |
| `contexts/UsbContext.js` | 2000 | Extraire sous-contextes |
| `api/handlers/devices/crud.php` | 862 | À vérifier |
| `api/handlers/devices/measurements.php` | 875 | À vérifier |

## 🚀 Ordre d'Exécution

1. **Documentation** (le plus simple, impact faible)
2. **Optimisation SQL/Pagination** (impact performance)
3. **Refactorisation duplication** (impact maintenabilité)
4. **Division fichiers volumineux** (le plus complexe, impact architecture)

---

**Statut** : En cours - Documentation
