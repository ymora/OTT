# 🔑 Comment récupérer le Token JWT

## Méthode Simple (Console du Navigateur)

### Étape 1 : Ouvrir votre Dashboard OTT
- Allez sur votre dashboard OTT (https://ymora.github.io/OTT/ ou http://localhost:3000)
- **Assurez-vous d'être connecté** (vous devez voir votre dashboard)

### Étape 2 : Ouvrir la Console
- Appuyez sur la touche **`F12`** de votre clavier
- OU cliquez droit sur la page > **"Inspecter"** ou **"Inspecter l'élément"**
- Une fenêtre s'ouvre en bas ou à droite de votre écran

### Étape 3 : Aller dans l'onglet Console
- En haut de la fenêtre qui s'est ouverte, vous verrez des onglets : **Elements**, **Console**, **Network**, etc.
- Cliquez sur l'onglet **"Console"**

### Étape 4 : Taper la commande
- En bas de la console, vous verrez un champ où vous pouvez taper (il y a souvent un `>` ou `▷`)
- Tapez exactement ceci (copiez-collez) :
  ```javascript
  localStorage.getItem('ott_token')
  ```
- Appuyez sur **Entrée**

### Étape 5 : Copier le token
- Le token s'affichera (une longue chaîne de caractères)
- **Sélectionnez tout le token** (sans les guillemets `"` au début et à la fin)
- **Copiez-le** (Ctrl+C ou clic droit > Copier)

### Étape 6 : Utiliser le token
- Exécutez le script : `.\scripts\init_firmware_db_direct.ps1`
- Quand il demande le token, **collez-le** (Ctrl+V)

---

## Alternative : Depuis l'onglet Application

### Étape 1 : Ouvrir DevTools (F12)

### Étape 2 : Aller dans l'onglet "Application"
- Cliquez sur **"Application"** (ou **"Stockage"** en français)

### Étape 3 : Trouver Local Storage
- Dans le menu de gauche, développez **"Local Storage"**
- Cliquez sur votre domaine (ex: `https://ymora.github.io` ou `http://localhost:3000`)

### Étape 4 : Trouver ott_token
- Dans la liste qui s'affiche à droite, cherchez la ligne avec **"ott_token"**
- Double-cliquez sur la **valeur** (colonne de droite)
- **Sélectionnez et copiez** tout le token

---

## Image de référence

```
┌─────────────────────────────────────────┐
│  Dashboard OTT                          │
│                                         │
│  [Votre contenu ici]                   │
│                                         │
└─────────────────────────────────────────┘
         │
         │ F12 ou clic droit > Inspecter
         ▼
┌─────────────────────────────────────────┐
│ Elements │ Console │ Network │ ...      │ ← Cliquez sur "Console"
├─────────────────────────────────────────┤
│                                          │
│  > localStorage.getItem('ott_token')    │ ← Tapez ici
│  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." │ ← Le token s'affiche
│                                          │
└─────────────────────────────────────────┘
```

---

## Aide supplémentaire

Si vous ne voyez pas la console :
- Essayez **F12** plusieurs fois
- Ou **Ctrl+Shift+I** (Windows/Linux)
- Ou **Cmd+Option+I** (Mac)

Si le token ne s'affiche pas :
- Assurez-vous d'être **connecté** au dashboard
- Vérifiez que vous êtes sur le bon site (pas sur une autre page)
- Essayez de vous déconnecter et reconnecter

