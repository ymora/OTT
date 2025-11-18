# 📊 Schéma de la Base de Données OTT

## 🗂️ Vue d'Ensemble

Base de données PostgreSQL pour le système OTT (HAPPLYZ MEDICAL SAS) - Gestion de dispositifs médicaux IoT avec notifications, OTA, et audit.

---

## 📐 Schéma Relationnel (ERD)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SYSTÈME D'AUTHENTIFICATION                           │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────┐         ┌──────────────────┐         ┌─────────────────────┐
│   roles     │         │  role_permissions│         │   permissions       │
├─────────────┤         ├──────────────────┤         ├─────────────────────┤
│ PK id       │◄──┐     │ PK role_id       │         │ PK id               │
│    name     │   │     │ PK permission_id │         │    code             │
│    desc     │   │     └──────────────────┘         │    description      │
│    ...      │   │              │                   │    category         │
└─────────────┘   │              │                   └─────────────────────┘
                  │              │                            ▲
                  │              └────────────────────────────┘
                  │
┌─────────────┐   │
│   users     │   │
├─────────────┤   │
│ PK id       │───┘
│    email    │
│    password │
│    name     │
│    phone    │
│ FK role_id  │───┐
│    is_active│   │
│    ...      │   │
└─────────────┘   │
                  │
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GESTION DES PATIENTS                                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────┐
│  patients   │
├─────────────┤
│ PK id       │
│    name     │
│    birth    │
│    phone    │
│    email    │
│    city     │
│    ...      │
└─────────────┘
      │
      │ 1:N
      │
      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GESTION DES DISPOSITIFS                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────┐         ┌──────────────────────┐
│  devices    │         │ device_configurations│
├─────────────┤         ├──────────────────────┤
│ PK id       │◄────────┤ PK device_id         │
│    sim_iccid│         │    firmware_version  │
│    serial   │         │    sleep_minutes     │
│    name     │         │    ota_pending      │
│ FK patient_id│        │    calibration       │
│    status   │         │    ...               │
│    location │         └──────────────────────┘
│    battery  │
│    ...      │
└─────────────┘
      │
      │ 1:N
      │
      ├──────────────────┐
      │                  │
      ▼                  ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│measurements│  │   alerts    │  │device_logs  │  │device_      │
├─────────────┤  ├─────────────┤  ├─────────────┤  │commands     │
│ PK id       │  │ PK id       │  │ PK id       │  ├─────────────┤
│ FK device_id│  │ FK device_id│  │ FK device_id│  │ PK id       │
│    timestamp│  │    type     │  │    level    │  │ FK device_id│
│    flowrate │  │    severity │  │    event    │  │    command  │
│    battery  │  │    message  │  │    message  │  │    status   │
│    ...      │  │ FK resolved │  │    details  │  │    ...      │
└─────────────┘  │    ...      │  │    ...      │  └─────────────┘
                 └─────────────┘  └─────────────┘
                        │
                        │ FK resolved_by
                        ▼
                 ┌─────────────┐
                 │   users     │
                 └─────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         GESTION DES FIRMWARES                               │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────┐
│ firmware_versions     │
├──────────────────────┤
│ PK id                │
│    version           │
│    file_path         │
│    checksum          │
│    is_stable         │
│ FK uploaded_by       │───┐
│    ...               │   │
└──────────────────────┘   │
                          │
                          ▼
                   ┌─────────────┐
                   │   users     │
                   └─────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         SYSTÈME DE NOTIFICATIONS                            │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────┐         ┌──────────────────────────────┐
│   users     │         │ user_notifications_preferences│
├─────────────┤         ├──────────────────────────────┤
│ PK id       │◄────────┤ PK user_id                   │
│    ...      │         │    email_enabled             │
└─────────────┘         │    sms_enabled               │
                        │    push_enabled              │
                        │    notify_battery_low        │
                        │    notify_device_offline     │
                        │    notify_abnormal_flow      │
                        │    notify_new_patient        │
                        │    phone_number              │
                        │    quiet_hours               │
                        └──────────────────────────────┘

┌─────────────┐         ┌──────────────────────────────┐
│  patients   │         │patient_notifications_preferences│
├─────────────┤         ├──────────────────────────────┤
│ PK id       │◄────────┤ PK patient_id                 │
│    ...      │         │    email_enabled             │
└─────────────┘         │    sms_enabled               │
                        │    push_enabled              │
                        │    notify_battery_low        │
                        │    notify_device_offline     │
                        │    notify_abnormal_flow      │
                        │    notify_alert_critical     │
                        │    quiet_hours               │
                        └──────────────────────────────┘
                                │
                                │
                                ▼
                        ┌──────────────────┐
                        │notifications_queue│
                        ├──────────────────┤
                        │ PK id            │
                        │ FK user_id       │───┐
                        │ FK patient_id    │───┘
                        │    type          │
                        │    priority      │
                        │    message       │
                        │    status        │
                        │    attempts      │
                        │    ...           │
                        └──────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         SYSTÈME D'AUDIT                                      │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────┐         ┌─────────────┐
│   users     │         │ audit_logs  │
├─────────────┤         ├─────────────┤
│ PK id       │◄────────┤ PK id       │
│    ...      │         │ FK user_id  │
└─────────────┘         │    action   │
                        │    entity   │
                        │    old_value│
                        │    new_value│
                        │    ...      │
                        └─────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              VUES (VIEWS)                                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────┐         ┌──────────────────────┐
│  device_stats        │         │  users_with_roles     │
├──────────────────────┤         ├──────────────────────┤
│ Vue agrégée:         │         │ Vue enrichie:        │
│ - devices            │         │ - users              │
│ - patients           │         │ - roles              │
│ - configurations     │         │ - permissions         │
│ - measurements       │         │ (agrégées)           │
│ - stats 7 jours      │         └──────────────────────┘
└──────────────────────┘
```

---

## 📋 Détail des Tables

### 🔐 **AUTHENTIFICATION & PERMISSIONS**

#### `roles`
- **Description**: Rôles utilisateurs (admin, medecin, technicien)
- **Clés**: `PK: id`
- **Relations**: `1:N → users`, `N:M → permissions` (via `role_permissions`)

#### `permissions`
- **Description**: Permissions système (devices.view, patients.edit, etc.)
- **Clés**: `PK: id`, `UNIQUE: code`
- **Relations**: `N:M → roles` (via `role_permissions`)

#### `role_permissions`
- **Description**: Table de liaison roles ↔ permissions
- **Clés**: `PK: (role_id, permission_id)`
- **Relations**: `N:1 → roles`, `N:1 → permissions`
- **Cascade**: `ON DELETE CASCADE`

#### `users`
- **Description**: Utilisateurs du système
- **Clés**: `PK: id`, `UNIQUE: email`
- **Relations**: 
  - `N:1 → roles` (FK: `role_id`)
  - `1:1 → user_notifications_preferences`
  - `1:N → audit_logs`
  - `1:N → firmware_versions` (uploaded_by)
  - `1:N → alerts` (resolved_by)
  - `1:N → device_commands` (requested_by)
  - `1:N → notifications_queue`

---

### 👥 **PATIENTS**

#### `patients`
- **Description**: Patients suivis
- **Clés**: `PK: id`
- **Relations**: 
  - `1:N → devices` (patient_id)
  - `1:1 → patient_notifications_preferences`
  - `1:N → notifications_queue`

---

### 📱 **DISPOSITIFS**

#### `devices`
- **Description**: Dispositifs IoT OTT
- **Clés**: `PK: id`, `UNIQUE: sim_iccid`, `UNIQUE: device_serial`
- **Relations**: 
  - `N:1 → patients` (FK: `patient_id`, `ON DELETE SET NULL`)
  - `1:1 → device_configurations`
  - `1:N → measurements`
  - `1:N → alerts`
  - `1:N → device_logs`
  - `1:N → device_commands`

#### `device_configurations`
- **Description**: Configuration des dispositifs (firmware, OTA, calibration)
- **Clés**: `PK: device_id`
- **Relations**: `1:1 → devices` (FK: `device_id`, `ON DELETE CASCADE`)

#### `measurements`
- **Description**: Mesures de débit et batterie
- **Clés**: `PK: id`
- **Relations**: `N:1 → devices` (FK: `device_id`, `ON DELETE CASCADE`)
- **Index**: `(device_id, timestamp DESC)`

#### `alerts`
- **Description**: Alertes système (batterie faible, offline, etc.)
- **Clés**: `PK: id` (VARCHAR)
- **Relations**: 
  - `N:1 → devices` (FK: `device_id`, `ON DELETE CASCADE`)
  - `N:1 → users` (FK: `resolved_by`, nullable)
- **Index**: `device_id`, `(status, severity)`

#### `device_logs`
- **Description**: Logs événements dispositifs
- **Clés**: `PK: id`
- **Relations**: `N:1 → devices` (FK: `device_id`, `ON DELETE CASCADE`)
- **Index**: `(device_id, timestamp DESC)`

#### `device_commands`
- **Description**: Commandes envoyées aux dispositifs
- **Clés**: `PK: id`
- **Relations**: 
  - `N:1 → devices` (FK: `device_id`, `ON DELETE CASCADE`)
  - `N:1 → users` (FK: `requested_by`, nullable, `ON DELETE SET NULL`)

---

### 🔄 **FIRMWARES**

#### `firmware_versions`
- **Description**: Versions de firmware disponibles
- **Clés**: `PK: id`, `UNIQUE: version`
- **Relations**: `N:1 → users` (FK: `uploaded_by`, nullable, `ON DELETE SET NULL`)

---

### 📧 **NOTIFICATIONS**

#### `user_notifications_preferences`
- **Description**: Préférences de notifications des utilisateurs
- **Clés**: `PK: user_id`
- **Relations**: `1:1 → users` (FK: `user_id`, `ON DELETE CASCADE`)

#### `patient_notifications_preferences`
- **Description**: Préférences de notifications des patients
- **Clés**: `PK: patient_id`
- **Relations**: `1:1 → patients` (FK: `patient_id`, `ON DELETE CASCADE`)

#### `notifications_queue`
- **Description**: File d'attente des notifications à envoyer
- **Clés**: `PK: id`
- **Relations**: 
  - `N:1 → users` (FK: `user_id`, nullable, `ON DELETE CASCADE`)
  - `N:1 → patients` (FK: `patient_id`, nullable, `ON DELETE CASCADE`)
- **Contrainte**: `CHECK (user_id IS NOT NULL OR patient_id IS NOT NULL)`
- **Index**: `(status, type)`

---

### 📝 **AUDIT**

#### `audit_logs`
- **Description**: Logs d'audit de toutes les actions
- **Clés**: `PK: id`
- **Relations**: `N:1 → users` (FK: `user_id`, nullable, `ON DELETE SET NULL`)
- **Index**: `user_id`, `action`

---

## 🔍 **VUES (VIEWS)**

### `device_stats`
- **Description**: Statistiques agrégées des dispositifs
- **Tables sources**: `devices`, `patients`, `device_configurations`, `measurements`
- **Colonnes**: id, sim_iccid, device_name, status, last_seen, battery, patient, firmware, ota_pending, total_measurements, avg_flowrate_7d, minutes_since_last_seen

### `users_with_roles`
- **Description**: Utilisateurs enrichis avec rôles et permissions
- **Tables sources**: `users`, `roles`, `role_permissions`, `permissions`
- **Colonnes**: Tous les champs users + role_name, role_description, permissions (agrégées)

---

## 🔗 **Règles de Cascade**

| Table | Relation | Action |
|-------|----------|--------|
| `role_permissions` | `→ roles` | `ON DELETE CASCADE` |
| `role_permissions` | `→ permissions` | `ON DELETE CASCADE` |
| `devices` | `→ patients` | `ON DELETE SET NULL` |
| `device_configurations` | `→ devices` | `ON DELETE CASCADE` |
| `measurements` | `→ devices` | `ON DELETE CASCADE` |
| `alerts` | `→ devices` | `ON DELETE CASCADE` |
| `device_logs` | `→ devices` | `ON DELETE CASCADE` |
| `device_commands` | `→ devices` | `ON DELETE CASCADE` |
| `user_notifications_preferences` | `→ users` | `ON DELETE CASCADE` |
| `patient_notifications_preferences` | `→ patients` | `ON DELETE CASCADE` |
| `notifications_queue` | `→ users` | `ON DELETE CASCADE` |
| `notifications_queue` | `→ patients` | `ON DELETE CASCADE` |
| `audit_logs` | `→ users` | `ON DELETE SET NULL` |
| `firmware_versions` | `→ users` | `ON DELETE SET NULL` |
| `alerts` | `→ users` (resolved_by) | Pas de cascade (nullable) |
| `device_commands` | `→ users` (requested_by) | `ON DELETE SET NULL` |

---

## 📊 **Statistiques**

- **Total tables**: 16
- **Total vues**: 2
- **Total relations**: 20+
- **Index**: 6
- **Triggers**: 7 (mise à jour automatique de `updated_at`)

---

## 🎯 **Points Clés**

1. **Séparation claire** : Users (système) vs Patients (métier)
2. **Notifications unifiées** : Même structure pour users et patients
3. **Audit complet** : Toutes les actions sont loggées
4. **Cascade intelligente** : Suppression en cascade pour les données dépendantes, SET NULL pour les relations optionnelles
5. **Performance** : Index sur les colonnes fréquemment requêtées
6. **Intégrité** : Contraintes CHECK et UNIQUE pour garantir la cohérence

---

## 🔄 **Flux de Données Principaux**

1. **Authentification** : `users` → `roles` → `permissions`
2. **Suivi Patient** : `patients` → `devices` → `measurements` → `alerts`
3. **Notifications** : `alerts` → `notifications_queue` → (email/SMS/push)
4. **OTA** : `firmware_versions` → `device_configurations` → `devices`
5. **Audit** : Toutes les actions → `audit_logs`

---

*Dernière mise à jour : Basé sur `sql/schema.sql`*

