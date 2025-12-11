# 🚀 Quick Start - Audit Complet

## Lancement Rapide

### Depuis la racine du projet

```powershell
cd audit-complet\scripts
.\AUDIT_COMPLET_AUTOMATIQUE.ps1 -Verbose
```

### Ou utiliser le script de lancement

```powershell
.\audit-complet\scripts\LANCER_AUDIT.ps1 -Verbose
```

## Configuration

1. **Copier le fichier d'exemple** :
   ```powershell
   Copy-Item audit-complet\scripts\audit.config.example.ps1 audit-complet\scripts\audit.config.ps1
   ```

2. **Modifier les paramètres** dans `audit-complet\scripts\audit.config.ps1`

3. **Ou utiliser des variables d'environnement** :
   ```powershell
   $env:AUDIT_EMAIL = "votre@email.com"
   $env:AUDIT_PASSWORD = "votre_mot_de_passe"
   $env:AUDIT_API_URL = "https://votre-api.com"
   ```

## Résultats

Les résultats sont sauvegardés dans `audit-complet\resultats\` avec un timestamp.

**Note** : Les résultats précédents sont automatiquement supprimés au début de chaque nouvel audit.

## Plans de Correction

Consulter `audit-complet\plans\` pour :
- Plan de correction complet
- Todos et checklist
- Résumés et analyses

## Documentation

- **README principal** : `audit-complet\README.md`
- **Documentation audit** : `audit-complet\scripts\README_AUDIT.md`

---

**Note** : L'audit nécessite une connexion à l'API (authentification JWT).

