# Options de configuration des branches pour les notifications

## 🌿 Configuration actuelle :
```yaml
on:
  push:
    branches: [ main ]  # Uniquement main
```

## 🔧 Options possibles :

### Option 1 - Toutes les branches :
```yaml
on:
  push:
    branches: [ "*" ]  # Toutes les branches
```

### Option 2 - Branches principales :
```yaml
on:
  push:
    branches: [ main, dev, develop ]  # Branches de production/développement
```

### Option 3 - Branches avec préfixes :
```yaml
on:
  push:
    branches: [ main, "feature/*", "hotfix/*" ]  # main + features + hotfixes
```

### Option 4 - Exclure certaines branches :
```yaml
on:
  push:
    branches-ignore: [ "test/*", "experimental/*" ]  # Tout sauf test/exp
```

## 🎯 Recommandation actuelle :
**Garder `main` uniquement** pour éviter les notifications excessives sur les branches de développement.

## 🔄 Si besoin de changer :
Dites-moi quelle configuration vous préférez et je modifie tous les workflows !
