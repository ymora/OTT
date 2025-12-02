# Problème Modal et Dispositif USB

## 🔍 Problème actuel

1. **Le modal est toujours rempli avec les infos du dispositif USB** - ne devrait pas
2. **Le bouton "Enregistrer" ne fonctionne pas**
3. **Si on change une info, elle est remise** - le formulaire se réinitialise

## 🔧 Solution complète

### Problème 1 : Formulaire pré-rempli avec données USB

Le formulaire ne devrait JAMAIS être pré-rempli avec les données USB pour la création manuelle.

**Cause :** Le `useEffect` dans DeviceModal dépend de `editingItem`, ce qui peut causer des réinitialisations.

**Solution :** 
- Ne dépendre QUE de `isOpen` dans le useEffect
- Toujours mettre formulaire vide en mode création (même si editingItem existe)
- Ne jamais pré-remplir avec les données USB

### Problème 2 : Bouton "Enregistrer" ne fonctionne pas

Le bouton pourrait ne pas fonctionner si le formulaire se réinitialise pendant l'envoi.

**Solution :**
- S'assurer que le formulaire ne se réinitialise jamais après l'ouverture
- Vérifier que `onSave` est bien await dans DeviceModal

### Problème 3 : Infos remises après changement

Le formulaire se réinitialise quand les données USB changent.

**Solution :**
- Le formulaire ne doit se réinitialiser QUE lors de l'ouverture du modal
- Utiliser un ref pour empêcher les réinitialisations multiples

