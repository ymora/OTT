# Activer DEBUG_ERRORS

Pour activer le mode debug et voir les erreurs détaillées dans les réponses API :

## Sur Render (Production)

1. Allez dans votre dashboard Render : https://dashboard.render.com
2. Sélectionnez votre service `ott-api`
3. Allez dans l'onglet **Environment**
4. Ajoutez ou modifiez la variable d'environnement :
   - **Key**: `DEBUG_ERRORS`
   - **Value**: `true`
5. Cliquez sur **Save Changes**
6. Le service sera redéployé automatiquement

## En développement local

Créez un fichier `.env.php` à la racine du projet avec :

```php
DEBUG_ERRORS=true
```

Le fichier `.env.php` est ignoré par Git (dans .gitignore) pour éviter de commiter des secrets.

## Vérification

Une fois activé, les réponses d'erreur API incluront :
- `error_message` : Message d'erreur complet
- `error_code` : Code d'erreur SQL/HTTP
- `file` : Fichier où l'erreur s'est produite
- `line` : Ligne où l'erreur s'est produite

## ⚠️ Sécurité

**IMPORTANT** : Désactivez `DEBUG_ERRORS=false` en production après avoir résolu les problèmes, car cela expose des informations sensibles sur la structure de votre code.

