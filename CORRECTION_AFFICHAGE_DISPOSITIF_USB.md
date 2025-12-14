# Correction Affichage Dispositif USB dans le Tableau

## ✅ Problème identifié

**Symptôme :**
- Le dispositif USB connecté n'apparaît pas dans le tableau
- Le dispositif devrait apparaître même s'il n'est pas enregistré en base de données

**Cause :**
La fonction `isUsbDeviceRegistered()` vérifiait incorrectement si l'ID commençait par `'usb-'` (avec un tiret), mais les IDs virtuels créés sont :
- `usb_info_${Date.now()}` (avec underscore)
- `usb_temp_${Date.now()}` (avec underscore)

Donc la fonction retournait `true` (considéré comme enregistré) alors qu'elle devait retourner `false` (non enregistré), empêchant l'ajout au tableau.

---

## ✅ Corrections appliquées

### 1. Correction de `isUsbDeviceRegistered()` dans `UsbContext.js`

**Ligne 24-29 :**
```javascript
// AVANT
const isUsbDeviceRegistered = useCallback(() => {
  if (!usbDevice?.id) return false
  // Vrai ID = nombre ou string qui ne commence pas par 'usb-'
  return typeof usbDevice.id === 'number' || 
         (typeof usbDevice.id === 'string' && !usbDevice.id.startsWith('usb-'))
}, [usbDevice])

// APRÈS
const isUsbDeviceRegistered = useCallback(() => {
  if (!usbDevice?.id) return false
  // Vrai ID = nombre ou string qui ne commence pas par 'usb' (usb_info_, usb_temp_, usb-, etc.)
  return typeof usbDevice.id === 'number' || 
         (typeof usbDevice.id === 'string' && !usbDevice.id.startsWith('usb'))
}, [usbDevice])
```

**Changement :** `startsWith('usb-')` → `startsWith('usb')` pour détecter tous les IDs virtuels (avec underscore ou tiret).

---

### 2. Correction de `hasRealId` dans `UsbStreamingTab.js`

**Ligne 2039-2041 :**
```javascript
// AVANT
const hasRealId = device?.id && 
  (typeof device.id === 'number' || 
   (typeof device.id === 'string' && !device.id.startsWith('usb-')))

// APRÈS
const hasRealId = device?.id && 
  (typeof device.id === 'number' || 
   (typeof device.id === 'string' && !device.id.startsWith('usb')))
```

**Changement :** `startsWith('usb-')` → `startsWith('usb')` pour cohérence.

---

## 📊 Logique d'affichage dans le tableau

**Fichier :** `components/configuration/UsbStreamingTab.js` (ligne 386-457)

Le dispositif USB est ajouté au tableau `devicesToDisplay` si :
1. `usbDevice` existe
2. `!isUsbDeviceRegistered()` retourne `true` (dispositif non enregistré)
3. Et soit :
   - Il n'a pas d'identifiants (`sim_iccid` ou `device_serial`) → toujours ajouter
   - Il a des identifiants mais n'existe pas en base (vérifié par comparaison ICCID/Serial)

---

## ✅ Résultat

Maintenant, les dispositifs USB virtuels (avec IDs `usb_info_...`, `usb_temp_...`, etc.) sont correctement détectés comme **non enregistrés** et sont ajoutés au tableau d'affichage.

**Le dispositif USB connecté devrait maintenant apparaître dans le tableau même s'il n'est pas enregistré en base de données.**
