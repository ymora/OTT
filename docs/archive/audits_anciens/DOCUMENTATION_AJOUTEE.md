# 📚 DOCUMENTATION PROJET

## Modules déjà documentés

### Hooks
- ✅ `hooks/useApiData.js` - Hook pour charger des données API
- ✅ `hooks/useStats.js` - Hook pour calculs statistiques
- ✅ `hooks/useFilter.js` - Hook pour filtrage de données
- ✅ `hooks/useDebounce.js` - Hook pour debounce
- ✅ `hooks/useEntityModal.js` - Hook pour gestion modals CRUD
- ✅ `hooks/useEntityDelete.js` - Hook pour suppression entités

### Lib
- ✅ `lib/dateUtils.js` - Utilitaires formatage dates
- ✅ `lib/statusUtils.js` - Utilitaires couleurs statut
- ✅ `lib/api.js` - Helpers API fetch
- ✅ `lib/logger.js` - Logger personnalisé
- ✅ `lib/deviceCommands.js` - Commandes dispositifs

### Composants
- ✅ `components/DataTable.js` - Table HTML réutilisable
- ✅ `components/DeviceModal.js` - Modal dispositifs
- ✅ `components/UserPatientModal.js` - Modal users/patients
- ✅ `components/Modal.js` - Modal générique

### API
- ✅ `api/helpers_sql.php` - Helpers SQL sécurisés
- ✅ `api/validators.php` - Validators inputs
- ✅ `api/helpers.php` - Helpers généraux

## Structure du projet

```
maxime/
├── api/               # Backend PHP
│   ├── handlers/      # Handlers API modulaires
│   ├── helpers.php    # Fonctions utilitaires
│   ├── helpers_sql.php # Helpers SQL sécurisés
│   └── validators.php  # Validators inputs
├── app/               # Frontend Next.js
│   └── dashboard/     # Pages dashboard
├── components/        # Composants React
├── contexts/          # Contexts React (Auth, USB)
├── hooks/             # Custom hooks React
├── lib/               # Utilitaires frontend
├── sql/               # Schéma et seeds BDD
└── scripts/           # Scripts divers
```

## Conventions de nommage

- **Pages:** `page.js` (Next.js App Router)
- **Composants:** PascalCase (ex: `DeviceModal.js`)
- **Hooks:** camelCase avec prefix `use` (ex: `useApiData.js`)
- **Utils:** camelCase (ex: `dateUtils.js`)
- **API:** snake_case PHP (ex: `helpers_sql.php`)

## README

Le fichier `README.md` est complet et à jour avec:
- Installation
- Configuration
- Déploiement  
- Architecture
- API
- Fonctionnalités

Score: 10/10

