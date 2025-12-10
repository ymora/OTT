# Configuration APN depuis le Dashboard

## Problème : `oper=<n/a> eps=KO gprs=KO`

Si vous voyez ces erreurs, cela signifie que le dispositif n'arrive pas à se connecter au réseau. Voici comment configurer l'APN depuis le dashboard.

## Étapes de Configuration

### 1. Accéder à la Configuration du Dispositif

1. Allez dans **Dispositifs OTT** (menu latéral)
2. Cliquez sur le dispositif concerné (ou créez-en un nouveau)
3. Le modal de configuration s'ouvre

### 2. Configurer l'APN

1. Dans le modal, trouvez la section **"Réseau"** (accordéon)
2. Cliquez sur l'accordéon pour l'ouvrir
3. Remplissez le champ **"APN"** avec la valeur appropriée :
   - **Free Mobile** : `free`
   - **Orange** : `orange` ou `orange.fr`
   - **SFR** : `sl2sfr` ou `sfr`
   - **Bouygues** : `mmsbouygtel` ou `internet`
   - **Autre opérateur** : Consultez la documentation de votre opérateur

### 3. Configurer le PIN SIM (si nécessaire)

Si votre carte SIM a un PIN :
1. Dans la même section **"Réseau"**
2. Remplissez le champ **"PIN SIM"** (4-8 chiffres)

### 4. Sauvegarder la Configuration

1. Cliquez sur **"Enregistrer"** en bas du modal
2. La configuration sera :
   - Sauvegardée en base de données
   - Envoyée au dispositif via **UPDATE_CONFIG** (OTA ou USB)
   - Le dispositif redémarrera automatiquement après réception

## Vérification

### Via USB (si connecté)

Si le dispositif est connecté en USB, vous verrez dans les logs :
```
✅ [CMD] Configuration appliquée et sauvegardée en NVS
    • APN: free | PIN: ***
```

### Via OTA

Si le dispositif est en ligne, la commande sera envoyée via OTA et appliquée au prochain réveil.

## Dépannage

### L'APN n'est pas appliqué

1. **Vérifier que l'APN est bien rempli** dans le modal (ne doit pas être vide)
2. **Vérifier la connexion** :
   - Si USB : le dispositif doit être connecté
   - Si OTA : le dispositif doit être en ligne (dernière connexion < 2h)
3. **Vérifier les logs du dispositif** pour voir si UPDATE_CONFIG a été reçu

### L'opérateur n'est toujours pas détecté

1. **Vérifier la carte SIM** :
   - Est-elle bien insérée ?
   - Est-elle activée ?
   - Le PIN est-il correct ?

2. **Vérifier le signal** :
   - Le dispositif est-il dans une zone couverte ?
   - Y a-t-il des obstacles (murs, métal) ?

3. **Vérifier l'APN** :
   - L'APN correspond-il à votre opérateur ?
   - Essayez l'APN générique `internet` si l'APN spécifique ne fonctionne pas

### Le dispositif redémarre en boucle

Si le dispositif redémarre en boucle après UPDATE_CONFIG :
1. Vérifier les logs pour voir l'erreur
2. Vérifier que l'APN n'est pas trop long (max 64 caractères)
3. Vérifier que le PIN est valide (4-8 chiffres)

## APN Recommandés par Opérateur

| Opérateur | APN Principal | APN Alternatif |
|-----------|---------------|----------------|
| Free Mobile | `free` | `internet` |
| Orange | `orange` | `orange.fr` |
| SFR | `sl2sfr` | `sfr` |
| Bouygues | `mmsbouygtel` | `internet` |

## Notes Importantes

- **L'APN est sauvegardé en NVS** : Une fois configuré, il persiste même après redémarrage
- **Le dispositif redémarre automatiquement** après UPDATE_CONFIG pour appliquer les changements
- **L'APN est utilisé dès le démarrage** : Le firmware charge l'APN depuis NVS au boot
- **Détection automatique** : Le firmware peut détecter l'opérateur et utiliser un APN recommandé si l'APN configuré ne fonctionne pas

