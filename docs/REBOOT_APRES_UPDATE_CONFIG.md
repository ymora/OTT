# Reboot Automatique après UPDATE_CONFIG

## Comportement Normal

✅ **Oui, le reboot est automatique** après une commande `UPDATE_CONFIG`.

### Séquence d'événements

1. **Réception de UPDATE_CONFIG** : Le dispositif reçoit la commande via USB ou OTA
2. **Application de la configuration** : Les paramètres sont sauvegardés en NVS
3. **Affichage du résumé** : Le dispositif affiche un résumé des changements
4. **Délai de 2 secondes** : Le dispositif attend 2 secondes avant de redémarrer
5. **Redémarrage automatique** : `esp_restart()` est appelé

### Logs attendus

Avant le redémarrage, vous devriez voir dans les logs USB :
```
✅ [CMD] Configuration appliquée et sauvegardée en NVS
    • Serial: OTT-8837 | ICCID: 8933150821
    • APN: free | PIN: ***
    • Sleep: 1440 min | GPS: OFF | Envoi: tous les 1 wakeup(s)
[CMD] 📤 ACK envoyé: ✅ Succès
[CMD] 🔄 Redémarrage du dispositif dans 2 secondes...
```

## Reconnexion USB après Reboot

### Problème : Les logs ne reprennent pas

Après le redémarrage, la connexion USB peut être perdue. C'est normal car :
- Le port USB est fermé lors du redémarrage
- Le navigateur peut perdre la référence au port
- Le dispositif redémarre et réinitialise sa communication série

### Solutions

#### Option 1 : Reconnexion Automatique (Recommandé)

Le dashboard devrait détecter automatiquement la reconnexion si :
- Le port USB est toujours sélectionné dans le navigateur
- La détection automatique USB est activée
- Le dispositif se reconnecte rapidement (< 10 secondes)

**Si la reconnexion automatique ne fonctionne pas :**

#### Option 2 : Reconnexion Manuelle

1. **Attendre 5-10 secondes** après le message de redémarrage
2. **Vérifier l'état de la connexion** dans l'interface USB
3. Si nécessaire, **cliquer sur "Se connecter"** ou **"Reconnecter"**
4. Les logs devraient reprendre automatiquement

#### Option 3 : Vérifier le Port USB

Si la reconnexion ne fonctionne pas :
1. Vérifier que le port USB est toujours sélectionné
2. Vérifier que le câble USB est toujours connecté
3. Essayer de **déconnecter puis reconnecter** le port USB

## Vérification Post-Reboot

### Logs attendus après redémarrage

Une fois reconnecté, vous devriez voir :
```
[BOOT] Démarrage OTT Firmware v2.0
[CFG] Chargement configuration depuis NVS...
[CFG] APN: free (depuis NVS)
[MODEM] Initialisation modem...
[MODEM] Opérateur détecté: Free Mobile
[MODEM] APN: free (type: IP pour internet)
[MODEM] Attachement réseau...
```

### Si les logs ne reprennent pas

1. **Vérifier la connexion USB** :
   - Le port est-il toujours ouvert ?
   - Y a-t-il une erreur de connexion ?

2. **Vérifier le dispositif** :
   - Le dispositif redémarre-t-il vraiment ? (LED clignotante)
   - Le dispositif est-il toujours alimenté ?

3. **Vérifier le navigateur** :
   - Le port USB est-il toujours autorisé ?
   - Y a-t-il des erreurs dans la console du navigateur ?

4. **Réessayer la connexion** :
   - Fermer et rouvrir le port USB
   - Rafraîchir la page si nécessaire

## Notes Importantes

- ⏱️ **Délai de redémarrage** : 2 secondes après UPDATE_CONFIG
- 🔄 **Reconnexion automatique** : Peut prendre 5-10 secondes
- 📡 **OTA** : Si le dispositif est en ligne, la commande sera appliquée au prochain réveil (pas de reboot immédiat)
- 🔌 **USB** : La reconnexion USB peut nécessiter une action manuelle

## Dépannage

### Le dispositif ne redémarre pas

- Vérifier que UPDATE_CONFIG a bien été reçu (ACK envoyé)
- Vérifier les logs pour voir si une erreur s'est produite
- Vérifier que le watchdog n'a pas expiré

### La reconnexion USB échoue

- Vérifier que le port USB est toujours disponible
- Vérifier que le câble USB est toujours connecté
- Essayer de déconnecter et reconnecter le port
- Rafraîchir la page si nécessaire

### Les logs ne reprennent pas après reconnexion

- Vérifier que le streaming USB est toujours actif
- Vérifier qu'il n'y a pas d'erreurs dans la console du navigateur
- Essayer de redémarrer le streaming USB

