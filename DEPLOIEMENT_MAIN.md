# Guide de Déploiement vers Main

**Date :** 2024-12-19  
**Branche actuelle :** `feature/usb-ota-monitoring`  
**Branche cible :** `main`

---

## 📋 Résumé des Modifications

### Fichiers modifiés (staged)
- ✅ `README.md` - Documentation mise à jour
- ✅ `components/configuration/UsbStreamingTab.js` - Simplification table
- ✅ `hardware/firmware/fw_ott_optimized/fw_ott_optimized.ino` - Logs détaillés OTA

### Fichiers modifiés (non staged)
- ⚠️ `api/handlers/devices/crud.php` - Support format unifié
- ⚠️ `api/handlers/devices/measurements.php` - Format unifié uniquement
- ⚠️ `components/DeviceMeasurementsModal.js` - Améliorations
- ⚠️ `components/configuration/UsbStreamingTab.js` - Suppression messages callbacks
- ⚠️ `contexts/UsbContext.js` - Amélioration logs (limite 500, suppression messages génériques)

### Nouveaux fichiers (documentation)
- 📝 `docs/VERIFICATION_AUDIT.md`
- 📝 `docs/VERIFICATION_LOGS_USB.md`
- 📝 `DIAGNOSTIC_MESURES_USB.md`

---

## 🚀 Étapes de Déploiement

### Étape 1 : Ajouter tous les fichiers modifiés

```powershell
# Ajouter les fichiers PHP modifiés
git add api/handlers/devices/crud.php
git add api/handlers/devices/measurements.php

# Ajouter les fichiers JS modifiés
git add components/DeviceMeasurementsModal.js
git add components/configuration/UsbStreamingTab.js
git add contexts/UsbContext.js

# Ajouter la documentation (optionnel mais recommandé)
git add docs/VERIFICATION_AUDIT.md
git add docs/VERIFICATION_LOGS_USB.md
```

### Étape 2 : Commit toutes les modifications

```powershell
git commit -m "feat: amélioration logs USB et format unifié

- Suppression formats V1/V2, utilisation format unifié uniquement
- Amélioration logs OTA détaillés dans firmware
- Augmentation limite logs USB de 80 à 500 lignes
- Suppression messages génériques redondants
- Support format unifié dans API (flow_lpm, battery_percent)
- Documentation vérification audit et logs USB"
```

### Étape 3 : Basculer sur main et merger

```powershell
# Sauvegarder l'état actuel
git branch backup-feature-usb-ota-$(Get-Date -Format "yyyyMMdd-HHmmss")

# Basculer sur main
git checkout main

# Récupérer les dernières modifications de main (si nécessaire)
git pull origin main

# Merger la branche feature
git merge feature/usb-ota-monitoring

# Résoudre les conflits s'il y en a (normalement aucun)
```

### Étape 4 : Vérifier et pousser vers origin

```powershell
# Vérifier l'état
git status

# Vérifier les fichiers modifiés
git log --oneline -5

# Pousser vers origin/main (déclenchera le déploiement sur Render)
git push origin main
```

---

## 🔄 Déploiement Automatique sur Render

Une fois poussé vers `origin/main`, Render va automatiquement :
1. ✅ Détecter le nouveau commit
2. ✅ Lancer le build (installation arduino-cli, etc.)
3. ✅ Déployer les nouveaux fichiers PHP
4. ✅ Redémarrer le service

**URL de l'API :** https://ott-jbln.onrender.com

**Temps de déploiement estimé :** 5-10 minutes

---

## 📝 Vérifications Post-Déploiement

Après le déploiement, vérifier :

1. **API fonctionnelle :**
   ```powershell
   curl https://ott-jbln.onrender.com/api.php/health
   ```

2. **Format unifié accepté :**
   - Vérifier que les mesures avec `flow_lpm` et `battery_percent` sont acceptées

3. **Logs USB améliorés :**
   - Connecter un dispositif USB
   - Vérifier que les logs détaillés OTA apparaissent
   - Vérifier que la limite de 500 lignes fonctionne

---

## ⚠️ Notes Importantes

1. **Render déploie automatiquement** depuis `origin/main`
2. **La version locale utilise déjà l'API Render** (pas besoin de changer la config)
3. **Les fichiers PHP seront mis à jour** automatiquement sur Render après le push
4. **Le firmware doit être re-flashé** pour bénéficier des nouveaux logs

---

## 🔙 Rollback si Problème

Si problème après déploiement :

```powershell
# Revenir au commit précédent
git revert HEAD
git push origin main

# Ou revenir à une version spécifique
git checkout <commit-hash>
git push origin main --force  # ⚠️ Utiliser avec précaution
```

---

## ✅ Checklist Finale

- [ ] Tous les fichiers modifiés sont ajoutés
- [ ] Commit créé avec message descriptif
- [ ] Basculé sur main
- [ ] Merge effectué sans conflit
- [ ] Push vers origin/main réussi
- [ ] Déploiement Render en cours
- [ ] API vérifiée après déploiement
- [ ] Logs USB vérifiés après déploiement

