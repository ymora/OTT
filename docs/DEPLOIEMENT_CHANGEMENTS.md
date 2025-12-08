# 🚀 Déploiement des Changements

## ✅ Changements Poussés sur GitHub

Tous les changements ont été commités et poussés sur `origin/main`.

### 📦 Commits Effectués

1. **Commit principal** : `feat: Améliorations modal historique mesures, corrections firmware et migrations SQL`
   - 18 fichiers modifiés/créés
   - 1881 insertions, 42 suppressions

2. **Commit fix** : `fix: Ajout copie pages statiques (migrate.html, diagnostic-measurements.html) dans export`
   - Assure que les pages statiques sont copiées lors du build GitHub Pages

3. **Commit cleanup** : `chore: Suppression fichier 0 créé par erreur`

---

## 🌐 URLs de Déploiement

### Version Web Statique (GitHub Pages)
**URL** : https://ymora.github.io/OTT/

**Pages statiques disponibles** :
- **Migration** : https://ymora.github.io/OTT/migrate.html
- **Diagnostic mesures** : https://ymora.github.io/OTT/diagnostic-measurements.html
- **Dashboard** : https://ymora.github.io/OTT/

### Version Locale (Développement)
**URL** : http://localhost:3000

**Pages statiques disponibles** :
- **Migration** : http://localhost:3000/migrate.html
- **Diagnostic mesures** : http://localhost:3000/diagnostic-measurements.html
- **Dashboard** : http://localhost:3000/

---

## 🔄 Workflow GitHub Actions

Le workflow `.github/workflows/deploy.yml` va automatiquement :
1. ✅ Détecter le push sur `main`
2. ✅ Builder le site Next.js en mode export statique
3. ✅ Copier les pages statiques (`migrate.html`, `diagnostic-measurements.html`)
4. ✅ Déployer sur GitHub Pages

**Temps estimé** : 2-5 minutes après le push

---

## 📋 Fichiers Modifiés/Créés

### Frontend
- `components/DeviceMeasurementsModal.js` - Sélection multiple, statistiques, export CSV
- `api/handlers/devices/measurements.php` - Support GPS par mesure, corrections types

### Firmware
- `hardware/firmware/fw_ott_optimized/fw_ott_optimized.ino` - Corrections watchdog, logs CSQ=99

### Migrations SQL
- `sql/migration_add_gps_to_measurements.sql` - Ajout latitude/longitude à measurements
- `sql/migration_add_min_max_columns.sql` - Ajout colonnes min/max à devices

### Scripts
- `scripts/test-send-measurement.ps1` - Test envoi mesure
- `scripts/test-check-measurement.ps1` - Vérification mesures
- `scripts/apply-migration-min-max.ps1` - Application migration

### Documentation
- `docs/ANALYSE_LOGS_WATCHDOG_MODEM.md`
- `docs/ANALYSE_MODAL_HISTORIQUE_MESURES.md`
- `docs/CORRECTIONS_FIRMWARE_APPLIQUEES.md`
- `docs/EXPLICATION_ERREUR_LOGS_USB.md`
- `docs/RESUME_DIAGNOSTIC_MESURES.md`
- `docs/VERIFICATION_COHERENCE_DONNEES.md`

### Build
- `scripts/deploy/export_static.sh` - Copie pages statiques

---

## 🎯 Prochaines Étapes

1. **Attendre le déploiement GitHub Actions** (2-5 min)
2. **Vérifier** : https://ymora.github.io/OTT/
3. **Tester localement** : `npm run dev` puis http://localhost:3000
4. **Appliquer les migrations SQL** :
   - Via https://ymora.github.io/OTT/migrate.html
   - Ou via l'API : `POST /api.php/migrate` avec `{"file": "migration_add_gps_to_measurements.sql"}`

---

## 📝 Notes

- Les pages statiques (`migrate.html`, `diagnostic-measurements.html`) sont maintenant copiées automatiquement lors du build
- Le workflow GitHub Actions se déclenche automatiquement à chaque push sur `main`
- Les changements seront visibles sur GitHub Pages dans 2-5 minutes

