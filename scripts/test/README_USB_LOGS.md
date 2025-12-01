# Scripts de test pour intercepter les logs USB

Ces scripts permettent d'intercepter et d'afficher en temps réel toutes les données envoyées par le dispositif USB connecté.

## Scripts disponibles

### 1. `test_usb_logs_intercept.ps1` (Recommandé)
Script complet avec analyse automatique des données, détection de port, et statistiques.

**Usage:**
```powershell
# Utilisation basique (port COM3 par défaut)
.\test_usb_logs_intercept.ps1

# Spécifier un port
.\test_usb_logs_intercept.ps1 -PortName COM4

# Détection automatique du port
.\test_usb_logs_intercept.ps1 -AutoDetectPort

# Limiter la durée à 60 secondes
.\test_usb_logs_intercept.ps1 -Duration 60

# Sans couleurs (pour redirection vers fichier)
.\test_usb_logs_intercept.ps1 -NoColors | Out-File logs.txt
```

**Fonctionnalités:**
- ✅ Détection automatique du port USB
- ✅ Analyse et coloration des messages JSON
- ✅ Affichage des données importantes (flow, battery, rssi)
- ✅ Statistiques en temps réel
- ✅ Timestamps précis (millisecondes)
- ✅ Différenciation des types de messages (JSON, logs, erreurs)

### 2. `test_usb_logs_simple.ps1`
Version simplifiée pour un affichage rapide des logs.

**Usage:**
```powershell
# Port par défaut (COM3)
.\test_usb_logs_simple.ps1

# Spécifier un port et baud rate
.\test_usb_logs_simple.ps1 -Port COM4 -BaudRate 115200
```

**Fonctionnalités:**
- ✅ Affichage simple et rapide
- ✅ Timestamps
- ✅ Coloration basique (JSON en jaune, logs en blanc)

### 3. `test_usb_response.ps1`
Teste si le firmware répond à la commande "usb".

**Usage:**
```powershell
.\test_usb_response.ps1
```

## Exemples d'utilisation

### Exemple 1: Intercepter tous les logs en continu
```powershell
# Démarrer l'intercepteur
.\test_usb_logs_intercept.ps1 -AutoDetectPort

# Le script affichera toutes les données reçues en temps réel
# Appuyez sur Ctrl+C pour arrêter
```

### Exemple 2: Sauvegarder les logs dans un fichier
```powershell
# Sauvegarder dans un fichier (sans couleurs pour éviter les codes ANSI)
.\test_usb_logs_intercept.ps1 -NoColors | Out-File "logs_$(Get-Date -Format 'yyyyMMdd_HHmmss').txt"
```

### Exemple 3: Tester pendant 30 secondes
```powershell
.\test_usb_logs_intercept.ps1 -Duration 30
```

## Interprétation des résultats

### Messages JSON (en jaune)
Les messages JSON contiennent les données structurées du dispositif:
- `device_info`: Informations du dispositif (ICCID, serial, firmware version)
- `device_config`: Configuration (sleep_minutes, calibration, etc.)
- `usb_stream`: Mesures en temps réel (flow_lpm, battery_percent, rssi, GPS)

Exemple:
```
[14:23:45.123] JSON[usb_stream] seq:42 {"flow_lpm":12.5,"battery_percent":85,"rssi":-75}
      flow: 12.5 L/min | battery: 85% | rssi: -75
```

### Logs du firmware (en blanc/vert)
Les logs texte du firmware (messages de debug, erreurs, etc.)

Exemple:
```
[14:23:45.456] [INFO] Starting measurement...
[14:23:45.789] [ERROR] Sensor timeout
```

### Statistiques
Le script affiche périodiquement:
- Nombre total de bytes reçus
- Nombre de lignes (JSON + logs)
- Débit en bytes/seconde

## Dépannage

### Le port n'est pas trouvé
```powershell
# Lister tous les ports disponibles
[System.IO.Ports.SerialPort]::GetPortNames()
```

### Aucune donnée reçue
1. Vérifiez que le dispositif est bien connecté
2. Vérifiez le baud rate (généralement 115200)
3. Vérifiez que le firmware envoie bien des données
4. Essayez de redémarrer le dispositif

### Le script se bloque
- Appuyez sur `Ctrl+C` pour arrêter proprement
- Vérifiez qu'aucun autre programme n'utilise le port (fermez le navigateur si nécessaire)

## Notes importantes

- ⚠️ **Un seul programme peut utiliser le port à la fois**: Fermez le navigateur ou l'application qui utilise le port USB avant de lancer le script
- ⚠️ **Le port doit être fermé proprement**: Le script gère automatiquement la fermeture, mais en cas d'erreur, vous devrez peut-être redémarrer le dispositif
- ✅ **Les données sont affichées en temps réel**: Toutes les données reçues sont immédiatement affichées avec leur timestamp

## Comparaison avec l'interface web

Ces scripts permettent de:
- ✅ Voir **exactement** ce qui est envoyé par le dispositif (sans traitement)
- ✅ Déboguer les problèmes de communication
- ✅ Vérifier que le firmware envoie bien les données attendues
- ✅ Capturer les logs même si l'interface web ne fonctionne pas

L'interface web (`UsbStreamingTab`) utilise ces mêmes données mais les traite et les affiche dans un tableau formaté.

