# Scripts OTT - Documentation

## 🚀 Scripts Principaux

### PowerShell (Windows)

- **`dev.ps1`** - Script principal pour le développement local
  ```powershell
  .\scripts\dev.ps1 [start|stop|restart|clean|test|build|setup]
  ```
- **`flash_firmware.ps1`** - Compilation et flash du firmware ESP32
  ```powershell
  .\scripts\flash_firmware.ps1 -Port COM6
  ```
- **`docker_init_db.ps1`** - Initialisation complète de la base Docker
- **`docker_migrate.ps1`** - Migration d'une base Docker existante
- **`setup_local_render_db.ps1`** - Configuration API locale avec Render DB (optionnel)

### Bash (Linux/Mac/GitHub Actions)

- **`db_migrate.sh`** - Migration base de données PostgreSQL (Render)
  ```bash
  DATABASE_URL=postgresql://... ./scripts/db_migrate.sh --seed
  ```
- **`docker_init_db.sh`** - Initialisation complète de la base Docker
- **`docker_migrate.sh`** - Migration d'une base Docker existante
- **`deploy_api.sh`** - Déploiement API sur Render
- **`deploy_dashboard.sh`** - Build et déploiement dashboard
- **`process_notifications.sh`** - Traitement des notifications (cron)

## 📦 Scripts Utilitaires

- **`process_notifications.php`** - Script PHP pour traiter la file de notifications
