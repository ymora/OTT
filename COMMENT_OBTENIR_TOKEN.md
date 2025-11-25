# 🔑 Comment Obtenir le Token JWT

## 📋 Méthode Simple (Chrome/Edge/Firefox)

### Étape 1 : Ouvrir les Outils Développeur
- **Windows/Linux** : Appuyez sur `F12` ou `Ctrl + Shift + I`
- **Mac** : Appuyez sur `Cmd + Option + I`
- **Ou** : Clic droit sur la page → "Inspecter" / "Examiner l'élément"

### Étape 2 : Aller dans l'onglet Console
1. En haut des outils développeur, vous verrez plusieurs onglets : **Elements**, **Console**, **Sources**, **Network**, etc.
2. Cliquez sur l'onglet **Console** (ou appuyez sur `Esc` si la console est déjà ouverte)

### Étape 3 : Taper la commande
Dans la console (zone de texte en bas), tapez exactement :
```javascript
localStorage.getItem('ott_token')
```

### Étape 4 : Appuyer sur Entrée
- Appuyez sur `Entrée`
- Le token s'affichera entre guillemets, par exemple : `"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."`

### Étape 5 : Copier le token
- Sélectionnez tout le texte entre les guillemets (sans les guillemets eux-mêmes)
- `Ctrl + C` (ou `Cmd + C` sur Mac) pour copier

---

## 🖼️ À quoi ça ressemble

```
┌─────────────────────────────────────────┐
│  Elements │ Console │ Sources │ Network │  ← Onglets en haut
├─────────────────────────────────────────┤
│                                           │
│  > localStorage.getItem('ott_token')     │  ← Vous tapez ici
│  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." │  ← Le token s'affiche
│                                           │
└─────────────────────────────────────────┘
```

---

## 🔍 Si vous ne voyez pas la console

### Chrome/Edge
1. Menu (3 points) → **Plus d'outils** → **Outils de développement**
2. Ou : `F12`

### Firefox
1. Menu (3 lignes) → **Outils de développement Web**
2. Ou : `F12`

### Safari (Mac)
1. Préférences → Avancé → Cocher "Afficher le menu Développement"
2. Menu Développement → Afficher la console JavaScript

---

## ⚠️ Si le token est `null`

Cela signifie que vous n'êtes pas connecté :
1. Allez sur https://ott-jbln.onrender.com
2. Connectez-vous avec vos identifiants
3. Réessayez `localStorage.getItem('ott_token')`

---

## 💡 Alternative : Via Application/Storage

Si vous préférez une interface graphique :

### Chrome/Edge
1. `F12` → Onglet **Application** (ou **Storage**)
2. Dans le menu de gauche : **Local Storage** → `https://ott-jbln.onrender.com`
3. Cherchez la clé `ott_token` dans la liste
4. Double-cliquez sur la valeur pour la copier

### Firefox
1. `F12` → Onglet **Stockage**
2. **Stockage local** → `https://ott-jbln.onrender.com`
3. Cherchez `ott_token` et copiez la valeur

---

## ✅ Vérification

Le token devrait ressembler à ça (très long) :
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxLCJlbWFpbCI6Inltb3JhQGZyZWUuZnIiLCJyb2xlX25hbWUiOiJhZG1pbiIsImlhdCI6MTczMjUwNzE1NywiZXhwIjoxNzMyNTkzNTU3fQ.abc123def456...
```

C'est normal qu'il soit très long (plusieurs centaines de caractères).

