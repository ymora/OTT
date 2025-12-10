# Diagnostic Déploiement GitHub Pages

## Problème : Version web en retard par rapport à la version locale

### Vérifications à effectuer

#### 1. **Commits poussés sur GitHub**
```bash
git log --oneline -5
git status
```
- ✅ Vérifier que `HEAD` et `origin/main` sont synchronisés
- ✅ Vérifier qu'il n'y a pas de commits locaux non poussés

#### 2. **Workflow GitHub Actions**
- Aller sur : https://github.com/ymora/OTT/actions
- Vérifier que le workflow "Deploy Next.js to GitHub Pages" s'est bien exécuté
- Vérifier qu'il n'y a pas d'erreurs (icône rouge ❌)
- Vérifier la date/heure du dernier déploiement

#### 3. **Configuration GitHub Pages**
- Aller sur : https://github.com/ymora/OTT/settings/pages
- Vérifier que :
  - **Source** : `GitHub Actions` (pas "Deploy from a branch")
  - Le workflow est bien configuré

#### 4. **Cache du navigateur**
La version web peut sembler en retard à cause du cache :
- **Ctrl+F5** (hard refresh)
- Vider le cache du navigateur
- Mode navigation privée
- Vérifier l'URL : https://ymora.github.io/OTT/

#### 5. **Service Worker (PWA)**
Le service worker peut mettre en cache l'ancienne version :
- Ouvrir les DevTools (F12)
- Aller dans **Application** > **Service Workers**
- Cliquer sur **Unregister** pour désinscrire le service worker
- Recharger la page

#### 6. **Variables d'environnement du build**
Le workflow utilise ces variables :
- `NEXT_PUBLIC_API_URL=https://ott-jbln.onrender.com`
- `NEXT_PUBLIC_BASE_PATH=/OTT`
- `NEXT_STATIC_EXPORT=true`
- `NODE_ENV=production`

Vérifier dans `.github/workflows/deploy.yml` que ces variables sont bien définies.

## Solutions

### Solution 1 : Forcer un nouveau déploiement
```bash
# Commit vide pour déclencher le workflow
git commit --allow-empty -m "chore: Force redeploy GitHub Pages"
git push
```

### Solution 2 : Déclencher manuellement depuis GitHub
1. Aller sur : https://github.com/ymora/OTT/actions
2. Cliquer sur "Deploy Next.js to GitHub Pages"
3. Cliquer sur "Run workflow" > "Run workflow"

### Solution 3 : Vérifier les logs du workflow
1. Aller sur : https://github.com/ymora/OTT/actions
2. Cliquer sur le dernier workflow
3. Vérifier les logs de chaque étape :
   - ✅ Build réussi ?
   - ✅ Export statique réussi ?
   - ✅ Déploiement réussi ?

### Solution 4 : Vérifier le contenu déployé
1. Aller sur : https://github.com/ymora/OTT/tree/gh-pages
   - (ou vérifier l'artifact du workflow)
2. Vérifier que les fichiers sont à jour
3. Vérifier la date de modification des fichiers

## Points importants

### Base de données
- ✅ La base de données est **partagée** entre local et web
- ✅ Les deux utilisent la même API Render : `https://ott-jbln.onrender.com`
- ✅ Les données sont donc **toujours synchronisées**

### Frontend
- ⚠️ Le frontend est **statique** (GitHub Pages)
- ⚠️ Il doit être **reconstruit** à chaque changement
- ⚠️ Le workflow GitHub Actions reconstruit automatiquement

### Différences possibles
1. **Cache navigateur** : L'ancienne version est mise en cache
2. **Service Worker** : L'ancienne version est mise en cache par le PWA
3. **Workflow non exécuté** : Le workflow n'a pas été déclenché
4. **Workflow en erreur** : Le workflow a échoué silencieusement
5. **Déploiement en cours** : Le déploiement prend quelques minutes

## Vérification rapide

### URL de production
- **Frontend** : https://ymora.github.io/OTT/
- **API** : https://ott-jbln.onrender.com

### Vérifier la version déployée
1. Ouvrir https://ymora.github.io/OTT/ en navigation privée
2. Ouvrir les DevTools (F12)
3. Aller dans **Console**
4. Vérifier les logs de démarrage
5. Vérifier la date/heure dans les logs

### Vérifier le dernier commit déployé
1. Ouvrir https://ymora.github.io/OTT/
2. Ouvrir les DevTools (F12)
3. Aller dans **Network**
4. Recharger la page
5. Vérifier les fichiers JS/CSS chargés (date de modification)

## Commandes utiles

```bash
# Vérifier les commits récents
git log --oneline -10

# Vérifier la synchronisation
git status

# Forcer un nouveau déploiement
git commit --allow-empty -m "chore: Force redeploy"
git push

# Vérifier le workflow localement (simulation)
npm run export
```

## Contact

Si le problème persiste :
1. Vérifier les logs GitHub Actions
2. Vérifier les erreurs dans la console du navigateur
3. Vérifier que Render est bien actif : https://ott-jbln.onrender.com/healthcheck

