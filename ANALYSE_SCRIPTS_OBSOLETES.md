# 🔍 ANALYSE SCRIPTS - Détection Obsolètes

## 📊 INVENTAIRE

**Total : 59 scripts**
- 41 PowerShell (.ps1)
- 13 Shell (.sh)
- 5 JavaScript (.js)

---

## ✅ SCRIPTS ESSENTIELS (À GARDER)

### Production
1. ✅ `scripts/generate_time_tracking.ps1` - Suivi temps (UTILISÉ)
2. ✅ `scripts/deploy/export_static.ps1` - Export static
3. ✅ `scripts/deploy/deploy_api.sh` - Deploy API
4. ✅ `scripts/deploy/deploy_dashboard.sh` - Deploy dashboard
5. ✅ `scripts/AUDIT_COMPLET_AUTOMATIQUE.ps1` - Audit auto (NOUVEAU)

### Dev
6. ✅ `scripts/dev/dev.ps1` - Dev rapide
7. ✅ `scripts/dev/start-dev.ps1` - Démarrage dev

### Hardware
8. ✅ `scripts/hardware/build_firmware_bin.ps1` - Build firmware
9. ✅ `scripts/hardware/flash_firmware.ps1` - Flash USB

### DB
10. ✅ `scripts/db/db_migrate.sh` - Migration BDD
11. ✅ `scripts/db/migrate_render.ps1` - Migration Render

---

## ❌ SCRIPTS OBSOLÈTES (À SUPPRIMER)

### Images (Fonction supprimée)
- ❌ `add_image_fallbacks_simple.ps1`
- ❌ `fix_images_fallback.ps1`
- ❌ `restore_images.ps1`

### Documentation (Inutiles)
- ❌ `fix_documentation.ps1`
- ❌ `analyze_docs.ps1`

### Docker (Non utilisé - Render only)
- ❌ `db/docker_init_db.ps1`
- ❌ `db/docker_init_db.sh`
- ❌ `db/docker_migrate.ps1`
- ❌ `db/docker_migrate.sh`

### Tests USB (Debug temporaires)
- ❌ `test/test_com3_hyperterminal.ps1`
- ❌ `test/test_com3.ps1`
- ❌ `test/test_usb_command.ps1`
- ❌ `test/test_usb_find_and_listen.ps1`
- ❌ `test/test_usb_logs_intercept.ps1`
- ❌ `test/test_usb_logs_simple.ps1`
- ❌ `test/test_usb_response.ps1`
- ❌ `test/test_usb_write_simulation.ps1`

### Tests API (Debug temporaires)
- ❌ `test/test_upload_ino_simple.ps1`
- ❌ `test/test_upload_ino.ps1`
- ❌ `test/test_compile_api.ps1`
- ❌ `test/diagnostic-complet.ps1`

### DB Init (Obsolètes)
- ❌ `db/init_firmware_db_direct.ps1`
- ❌ `db/init_firmware_db_sql.ps1`
- ❌ `db/migrate_last_values.ps1`
- ❌ `db/migrate_phone_users.ps1`
- ❌ `db/setup_local_render_db.ps1`

### Hardware (Possiblement obsolètes)
- ❌ `hardware/download_arduino_cli.ps1`
- ❌ `hardware/download_arduino_cli.sh`
- ❌ `hardware/install_arduino_cli.sh`
- ❌ `hardware/prepare_arduino_core.ps1`
- ❌ `hardware/prepare_arduino_core.sh`
- ❌ `hardware/setup_arduino_core.ps1`
- ❌ `hardware/setup_arduino_core.sh`

### Dev (Redondants)
- ❌ `dev/check-env.ps1`
- ❌ `dev/clean-dev.ps1`
- ❌ `dev/debug-dashboard.ps1`

### Autres
- ❌ `analyze-logs.js`
- ❌ `monitor-logs.js`
- ❌ `test/test_connection.js`
- ❌ `test/test_compile_api_auto.js`
- ❌ `test/test_compile_api.js`
- ❌ `test/test-all.ps1`
- ❌ `deploy/process_notifications.php` (async non utilisé)
- ❌ `deploy/process_notifications.sh`
- ❌ `deploy/verify-build.sh`
- ❌ `audit/verification_finale.sh`

**Total à supprimer : ~40 scripts obsolètes !**

---

## 🎯 RECOMMANDATION

Garder UNIQUEMENT :
1. `generate_time_tracking.ps1` (utilisé activement)
2. `AUDIT_COMPLET_AUTOMATIQUE.ps1` (nouveau, utile)
3. `deploy/export_static.ps1` (package.json)
4. `db/db_migrate.sh` (migrations production)
5. `db/migrate_render.ps1` (migrations Render)

**Supprimer les 40+ autres scripts de test/debug temporaires.**

