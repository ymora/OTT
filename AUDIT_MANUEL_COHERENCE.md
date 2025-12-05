# 🔍 AUDIT MANUEL - COHÉRENCE & UX
**Date** : 2024-12-05  
**Auditeur** : Assistant IA + Utilisateur  
**Contexte** : Audit complémentaire à AUDIT_COMPLET_AUTOMATIQUE.ps1

---

## ❌ PROBLÈMES CRITIQUES

### 1. **Incohérence nomenclature route "Outils"**
**Sévérité** : 🔴 Haute  
**Localisation** :
- `app/dashboard/outils/page.js` → Devrait être `app/dashboard/dispositifs/page.js`
- `components/Sidebar.js` ligne 20 : `path: '/dashboard/outils'`

**Problème** :
- Le menu affiche "Dispositifs OTT" mais la route est `/dashboard/outils`
- Incohérence entre l'URL et le contenu
- Confusion pour les utilisateurs et les développeurs

**Impact** :
- ⚠️ URLs bookmarkées par les utilisateurs invalides après correction
- 🔗 Liens externes potentiellement cassés
- 📚 Documentation incohérente

**Solution proposée** :
```bash
# 1. Renommer le dossier
mv app/dashboard/outils app/dashboard/dispositifs

# 2. Mettre à jour Sidebar.js
path: '/dashboard/dispositifs'

# 3. Redirection pour compatibilité (optionnel)
# Dans middleware.js ou layout.js
if (pathname === '/dashboard/outils') {
  redirect('/dashboard/dispositifs')
}
```

**Priorité** : 🔴 À faire AVANT la prochaine release

---

## ⚠️ PROBLÈMES MOYENS

### 2. **Absence de page dédiée "Dispositifs" (liste simple)**
**Sévérité** : 🟡 Moyenne  
**Problème** :
- `/dashboard/outils` contient l'upload firmware + USB streaming
- Pas de page simple pour consulter/gérer la **liste des dispositifs**
- L'utilisateur doit passer par "Vue Ensemble" ou "Base de données (admin)"

**Solution proposée** :
Créer `/dashboard/dispositifs/page.js` avec :
- 📋 Liste des dispositifs (tableau)
- ✏️ Modification rapide
- 🗑️ Suppression/archivage (avec modal unifié déjà créé)
- 📊 Statistiques basiques
- 🔗 Lien vers "Outils avancés" (actuel `/dashboard/outils` renommé `/dashboard/dispositifs/outils`)

**Architecture proposée** :
```
app/dashboard/dispositifs/
├── page.js              (Liste principale - tout le monde)
├── outils/
│   └── page.js          (Upload firmware, USB - admin/technicien)
```

**Priorité** : 🟡 À planifier

---

### 3. **Modal de suppression non unifié sur tous les composants**
**Sévérité** : 🟡 Moyenne  
**État** : ✅ **CORRIGÉ** dans cette session
- ✅ Patients : ConfirmModal unifié
- ✅ Users : ConfirmModal unifié
- ✅ Dispositifs (USB) : ConfirmModal unifié
- ❓ Autres composants ? (à vérifier)

**Action** : Vérifier tous les modals de suppression dans :
- `components/DeviceModal.js`
- `components/FlashModal.js`
- `components/UserPatientModal.js`

---

## 💡 AMÉLIORATIONS UX

### 4. **Fil d'Ariane (Breadcrumb) manquant**
**Sévérité** : 🟢 Basse  
**Problème** :
- Navigation profonde (ex: Dashboard > Base de données > Archives)
- Pas de fil d'Ariane pour revenir facilement

**Solution** :
Ajouter un composant `Breadcrumb` dans `layout.js`

---

### 5. **Permissions utilisateur pas claires dans le menu**
**Sévérité** : 🟢 Basse  
**Problème** :
- "Base de données" visible seulement pour admin, mais pas d'indication
- Certains utilisateurs cliquent et sont redirigés

**Solution** :
Ajouter badge "Admin" sur les items réservés

---

## 🔧 AMÉLIORATIONS TECHNIQUES

### 6. **Détecter les routes incohérentes automatiquement**
**Intégrer dans** : `AUDIT_COMPLET_AUTOMATIQUE.ps1`

**Code à ajouter** :
```powershell
# Nouvelle phase : Vérification cohérence routes/noms
Write-Section "COHÉRENCE ROUTES & NOMS DE FICHIERS"

$routes = @{
  "outils" = @{Expected="dispositifs"; Reason="Menu affiche 'Dispositifs OTT'"}
}

foreach ($route in $routes.Keys) {
  $path = "app/dashboard/$route"
  if (Test-Path $path) {
    $expected = $routes[$route].Expected
    Write-Warn "Route incohérente: /$route devrait être /$expected"
    Write-Host "  Raison: $($routes[$route].Reason)" -ForegroundColor Gray
  }
}
```

---

### 7. **Détecter les composants volumineux avec plusieurs responsabilités**
**Exemples détectés** :
- `UsbStreamingTab.js` : 1942 lignes (devrait être splitté)
  - Pourrait être : `UsbConnection.js` + `LogsViewer.js` + `DeviceManager.js`
- `InoEditorTab.js` : 1217 lignes (éditeur + compilation + upload)
- `UserPatientModal.js` : 1221 lignes (formulaire + validation + API)

**À intégrer dans l'audit** :
```powershell
# Détecter les fichiers avec multiple responsabilités
$largeFiles = Get-ChildItem -Recurse -Filter "*.js" | 
  Where-Object { (Get-Content $_.FullName | Measure-Object -Line).Lines -gt 800 }

foreach ($file in $largeFiles) {
  $content = Get-Content $file.FullName -Raw
  $responsibilities = 0
  if ($content -match "useState.*\[.*,.*\].*useState") { $responsibilities++ }  # Multiple states
  if ($content -match "useEffect.*useEffect") { $responsibilities++ }  # Multiple effects
  if ($content -match "const handle\w+.*const handle\w+") { $responsibilities++ }  # Multiple handlers
  
  if ($responsibilities -ge 3) {
    Write-Warn "$($file.Name): Trop de responsabilités ($responsibilities détectées)"
  }
}
```

---

### 8. **Vérifier cohérence entre menu Sidebar et routes existantes**
**À intégrer dans l'audit** :
```powershell
# Extraire les routes du Sidebar
$sidebarContent = Get-Content "components/Sidebar.js" -Raw
$menuRoutes = [regex]::Matches($sidebarContent, "path: '/dashboard/(\w+)'") | 
  ForEach-Object { $_.Groups[1].Value }

# Vérifier que chaque route existe
foreach ($route in $menuRoutes) {
  $path = "app/dashboard/$route"
  if (-not (Test-Path $path)) {
    Write-Err "Route menu inexistante: /dashboard/$route"
  }
}
```

---

## 📊 RÉSUMÉ

| Catégorie | Problèmes | Priorité |
|-----------|-----------|----------|
| 🔴 Critiques | 1 | Avant release |
| 🟡 Moyens | 2 | À planifier |
| 🟢 Améliorations | 3 | Nice to have |
| 🔧 Audit auto | 3 | À intégrer |

---

## ✅ ACTIONS IMMÉDIATES

1. ✅ **Renommer `/dashboard/outils` → `/dashboard/dispositifs`**
2. ✅ **Mettre à jour Sidebar.js**
3. ✅ **Ajouter redirect pour compatibilité**
4. 🔄 **Intégrer vérifications dans AUDIT_COMPLET_AUTOMATIQUE.ps1**

---

## 📝 NOTES

- Cet audit manuel complète l'audit automatique
- À refaire périodiquement (1x/mois recommandé)
- Intégrer progressivement les vérifications dans le script automatique

