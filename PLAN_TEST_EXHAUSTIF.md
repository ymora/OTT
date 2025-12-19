# Plan de Test Exhaustif - Application OTT

## 📋 Objectifs
Tester toutes les fonctionnalités de l'application de manière systématique et exhaustive.

## 🧪 Tests à Effectuer

### 1. Navigation et Pages
- [ ] Page Vue d'Ensemble (/dashboard)
  - [ ] Affichage des KPIs
  - [ ] Affichage de la carte
  - [ ] Accordéons des KPIs
  - [ ] Navigation vers dispositifs depuis KPIs
- [ ] Page Dispositifs (/dashboard/dispositifs)
  - [ ] Liste des dispositifs
  - [ ] Filtres (archivés)
  - [ ] Onglets (Streaming, Upload INO)
- [ ] Page Patients (/dashboard/patients)
  - [ ] Liste des patients
  - [ ] Recherche
  - [ ] Filtre archives
- [ ] Page Utilisateurs (/dashboard/users)
  - [ ] Liste des utilisateurs
  - [ ] Recherche
  - [ ] Filtre archives
- [ ] Page Migrations (/dashboard/admin-migrations)
  - [ ] Liste des migrations
  - [ ] Filtre migrations marquées

### 2. CRUD Patients
- [ ] Création patient
  - [ ] Modal s'ouvre
  - [ ] Validation des champs
  - [ ] Sauvegarde réussie
  - [ ] Message de succès
- [ ] Édition patient
  - [ ] Modal pré-rempli
  - [ ] Modification des champs
  - [ ] Sauvegarde réussie
- [ ] Archivage patient
  - [ ] Confirmation
  - [ ] Patient disparaît de la liste
  - [ ] Apparaît dans archives
- [ ] Restauration patient
  - [ ] Depuis archives
  - [ ] Patient réapparaît dans liste
- [ ] Suppression définitive
  - [ ] Confirmation
  - [ ] Patient supprimé

### 3. CRUD Utilisateurs
- [ ] Création utilisateur
  - [ ] Modal s'ouvre
  - [ ] Sélection rôle
  - [ ] Validation email
  - [ ] Sauvegarde réussie
- [ ] Édition utilisateur
  - [ ] Modal pré-rempli
  - [ ] Modification permissions
  - [ ] Sauvegarde réussie
- [ ] Archivage utilisateur
- [ ] Restauration utilisateur
- [ ] Suppression définitive

### 4. CRUD Dispositifs
- [ ] Création dispositif
- [ ] Édition dispositif
- [ ] Configuration dispositif
  - [ ] Modal configuration
  - [ ] Modification paramètres
  - [ ] Sauvegarde
- [ ] Archivage dispositif
- [ ] Restauration dispositif
- [ ] Suppression définitive

### 5. Modals
- [ ] Modal création patient
- [ ] Modal édition patient
- [ ] Modal création utilisateur
- [ ] Modal édition utilisateur
- [ ] Modal configuration dispositif
- [ ] Modal flash firmware
- [ ] Modal assignation dispositif
- [ ] Modal désassignation dispositif

### 6. Notifications
- [ ] Préférences notifications utilisateur
  - [ ] Email
  - [ ] SMS
  - [ ] Push
- [ ] Types d'alertes
  - [ ] Batterie faible
  - [ ] Dispositif hors ligne
  - [ ] Flux anormal
  - [ ] Nouveau patient (admin)

### 7. Archives et Restauration
- [ ] Archivage patient
- [ ] Restauration patient
- [ ] Archivage utilisateur
- [ ] Restauration utilisateur
- [ ] Archivage dispositif
- [ ] Restauration dispositif
- [ ] Filtre archives fonctionne

### 8. Permissions
- [ ] Admin : accès complet
- [ ] Médecin : restrictions
- [ ] Technicien : restrictions
- [ ] Vérification des endpoints protégés

### 9. API Endpoints
- [ ] GET /api.php/health
- [ ] GET /api.php/devices
- [ ] GET /api.php/patients
- [ ] GET /api.php/users
- [ ] POST /api.php/patients
- [ ] PUT /api.php/patients/:id
- [ ] DELETE /api.php/patients/:id
- [ ] POST /api.php/patients/:id/archive
- [ ] POST /api.php/patients/:id/restore

### 10. Fonctionnalités Avancées
- [ ] Recherche en temps réel
- [ ] Auto-refresh
- [ ] Gestion erreurs
- [ ] Messages de succès/erreur
- [ ] Loading states
- [ ] Dark mode

## 🔍 Points de Vérification
- Pas d'erreurs dans la console
- Pas d'erreurs 500 dans les réponses API
- Messages d'erreur clairs
- Validation des formulaires
- Confirmation des actions destructives
- Accessibilité (navigation clavier)
- Responsive design

