# 📊 Flux de Données - Users/Patients

## 🎯 Principe Fondamental

**LA BASE DE DONNÉES EST LA SEULE SOURCE DE VÉRITÉ**

## 🔄 Flux Complet

### 1. Chargement Initial (Tableaux)

```
Page (users/page.js ou patients/page.js)
  ↓
useApiData(['/api.php/users', '/api.php/roles'])
  ↓
API: handleGetUsers() ou handleGetPatients()
  ↓
SQL: SELECT avec LEFT JOIN user_notifications_preferences / patient_notifications_preferences
  ↓
COALESCE pour valeurs par défaut (FALSE si NULL)
  ↓
Retour JSON avec toutes les données (y compris notifications)
  ↓
Tableau affiche les icônes basées sur les données de la base
```

### 2. Modification via Modal

```
UserPatientModal.handleSubmit()
  ↓
1. Sauvegarde entité (user/patient) → API → Base de données
  ↓
2. Sauvegarde notifications → /api.php/users|patients/X/notifications → Base de données
  ↓
3. onSave() appelé → handleModalSave()
  ↓
4. refetch() → Recharge depuis API → Base de données
  ↓
5. Tableau mis à jour avec nouvelles données
```

### 3. Affichage des Icônes

```
Tableau lit: user.email_enabled, user.sms_enabled, etc.
  ↓
isTrue() convertit (true, 't', '1', 1) → boolean
  ↓
Affichage conditionnel:
  - Actif: icône normale
  - Inactif: icône avec opacity-40 grayscale
```

## ✅ Garanties de Synchronisation

1. **Base de données = Source de vérité**
   - Toutes les modifications passent par l'API
   - L'API écrit dans la base de données
   - Les tableaux lisent depuis la base de données

2. **refetch() après chaque modification**
   - Garantit que le tableau reflète l'état de la base
   - Pas de cache local qui pourrait être obsolète

3. **COALESCE dans les requêtes SQL**
   - Garantit des valeurs par défaut cohérentes
   - Évite les NULL qui pourraient causer des erreurs

4. **Unification Users/Patients**
   - Même flux pour les deux entités
   - Même structure de données
   - Même gestion d'erreurs

## 🔍 Points de Vérification

### ✅ Vérifié et Fonctionnel

- [x] `handleGetUsers` inclut notifications via LEFT JOIN
- [x] `handleGetPatients` inclut notifications via LEFT JOIN
- [x] COALESCE pour valeurs par défaut (FALSE)
- [x] `refetch()` appelé après `onSave()`
- [x] Tableaux utilisent `isTrue()` pour afficher les icônes
- [x] Modal sauvegarde d'abord entité, puis notifications
- [x] Gestion d'erreurs unifiée

### ⚠️ Points d'Attention

1. **Ordre de sauvegarde** : Entité d'abord, puis notifications
   - Si la sauvegarde de l'entité échoue, les notifications ne sont pas sauvegardées
   - C'est le comportement attendu (cohérence)

2. **refetch() asynchrone** : Le tableau se met à jour après la sauvegarde
   - Il peut y avoir un léger délai (réseau)
   - C'est normal et acceptable

3. **Table absente** : Si `patient_notifications_preferences` n'existe pas
   - L'API retourne des valeurs par défaut (FALSE)
   - Le tableau affiche tout désactivé
   - C'est le comportement attendu jusqu'à migration

## 📝 Code Clé

### API - handleGetUsers
```php
LEFT JOIN user_notifications_preferences unp ON u.id = unp.user_id
COALESCE(unp.email_enabled, FALSE) as email_enabled
```

### API - handleGetPatients
```php
LEFT JOIN patient_notifications_preferences pnp ON p.id = pnp.patient_id
COALESCE(pnp.email_enabled, FALSE) as email_enabled
```

### Frontend - Modal
```javascript
// 1. Sauvegarder entité
await fetchJson(..., endpoint, { method: 'PUT', body: JSON.stringify(payload) })

// 2. Sauvegarder notifications
await fetchJson(..., notifEndpoint, { method: 'PUT', body: JSON.stringify(prefsToSave) })

// 3. Rafraîchir
onSave() // → handleModalSave() → refetch()
```

### Frontend - Tableau
```javascript
// Lire depuis useApiData (qui lit depuis API qui lit depuis base)
const users = data?.users?.users || []

// Afficher icônes basées sur données de la base
{isTrue(user.email_enabled) ? <icône normale> : <icône grisée>}
```

## 🎯 Conclusion

**Le système est sûr et cohérent :**
- ✅ Base de données = Source de vérité unique
- ✅ Modal modifie la base
- ✅ Tableau lit depuis la base
- ✅ refetch() garantit la synchronisation
- ✅ Pas de cache local qui pourrait être obsolète
- ✅ Unification complète Users/Patients

