# Diagnostic des Erreurs HTTP 500

Date: 2025-01-XX

## Résumé des Erreurs

Les endpoints suivants retournent des erreurs HTTP 500 :
- `GET /api.php/firmwares`
- `GET /api.php/devices`
- `POST /api.php/usb-logs` (retourne du HTML au lieu de JSON)

## Causes Probables

### 1. **Problème : Headers déjà envoyés**

**Symptôme** : Erreur 500 avec réponse HTML au lieu de JSON

**Causes possibles** :
- Output buffer activé (`ob_start()` ligne 34 de api.php)
- Mais headers peuvent être envoyés avant le `header('Content-Type: application/json')`
- Erreurs PHP non capturées qui envoient du HTML

**Solution** :
- S'assurer que `ob_clean()` est appelé AVANT tout `header()`
- Vérifier que les handlers nettoient le buffer avant d'envoyer du JSON
- Ajouter une gestion d'erreur globale pour capturer les exceptions non catchées

### 2. **Problème : Fonctions helpers manquantes ou erreurs**

**Symptôme** : Erreur 500 dans `handleGetFirmwares()` ou `handleGetDevices()`

**Fonctions concernées** :
- `getProjectRoot()` - peut retourner `null` ou chemin invalide
- `getVersionDir()` - peut retourner une chaîne invalide
- `requireAdmin()` - peut lancer une exception si non authentifié
- `getCurrentUser()` - peut lancer une exception

**Solution** :
- Ajouter des vérifications de nullité
- Gérer les exceptions dans les fonctions helpers
- Ajouter des try/catch autour des appels de fonctions

### 3. **Problème : Base de données ou connexion PDO**

**Symptôme** : Erreur 500 avec message "Database error"

**Causes possibles** :
- Connexion PDO échouée
- Table `firmware_versions` ou `devices` n'existe pas
- Colonnes manquantes dans les tables

**Solution** :
- Vérifier la connexion PDO dans `bootstrap/database.php`
- Vérifier que les migrations ont été exécutées
- Ajouter des vérifications de schéma dans les handlers

## Corrections à Apporter

1. ✅ **Nettoyer le buffer de sortie AVANT les headers**
2. ✅ **Ajouter des vérifications nullité pour getProjectRoot() et getVersionDir()**
3. ✅ **Ajouter un try/catch global dans les handlers**
4. ✅ **Vérifier que les fonctions helpers retournent des valeurs valides**

