# 📊 Accordéons Vue d'Ensemble

**Date:** 2025-12-02

---

## ✅ Fonctionnalités Ajoutées

### 1. 📂 Accordéons dans Tous les KPIs

**7 cards avec accordéons:**
1. 🔌 **Dispositifs** (tous les dispositifs)
2. ✅ **En Ligne** (dispositifs actifs < 2h)
3. ⚠️ **Alertes** (dispositifs avec alertes critiques)
4. 🔋 **Batteries** (faibles <30% ou OK ≥30%)
5. 🔔 **Alertes Actives** (toutes les alertes)
6. 🔋 **Batteries Faibles** (dispositifs <30%)
7. 📦 **Non Assignés** (sans patient)

**Comportement:**
- ✅ **Fermé par défaut** (gain d'espace)
- ✅ **Clic sur la card** pour ouvrir/fermer
- ✅ **Indicateur visuel** (▶ fermé, ▼ ouvert)
- ✅ **Scroll interne** (max-height: 40 = ~160px)
- ✅ **Limite à 10 items** + indicateur "+X autres..."

---

### 2. 🗺️ Zoom Carte au Clic

**Interaction:**
- ✅ **Clic sur un dispositif** dans l'accordéon
- ✅ **Zoom automatique** sur la carte vers le dispositif
- ✅ **Scroll vers la carte** (behavior: smooth)
- ✅ **Focus visuel** sur le marqueur

**Fonction `zoomToDevice(deviceId)`:**
```javascript
const zoomToDevice = (deviceId) => {
  setFocusDeviceId(deviceId)
  document.querySelector('#map-container')?.scrollIntoView({ 
    behavior: 'smooth', 
    block: 'center' 
  })
}
```

---

### 3. 🎨 Design Cohérent

**Toutes les cards:**
- Même taille et padding
- Même typographie
- Icônes alignées à droite
- Bordures colorées selon le type
- Hover effects consistants

**Accordéons:**
- Bordure supérieure (séparation visuelle)
- Padding interne (px-3 pb-3)
- Scroll si plus de 10 items
- Hover sur chaque item (fond coloré)

---

## 🎯 Résultat

### Avantages UX
- ✅ **Vue compacte** par défaut (plus d'espace)
- ✅ **Détails à la demande** (accordéons)
- ✅ **Navigation rapide** (zoom carte)
- ✅ **Cohérence visuelle** (même format partout)

### Statistiques
- **7 accordéons** interactifs
- **Jusqu'à 70 dispositifs** affichables (7 x 10)
- **Zoom carte** en 1 clic
- **0 ligne de code mort**

---

## 📱 Responsive

- Mobile: 2 colonnes (KPIs et Actions Requises)
- Desktop: 4 colonnes (KPIs) + 3 colonnes (Actions)
- Accordéons: Toujours pleine largeur dans leur card

