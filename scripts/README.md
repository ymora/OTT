# Scripts de développement local

## 🚀 `restart_local.ps1`

Script complet pour redémarrer l'environnement de développement local.

**Fonctionnalités :**
- ✅ Libère les ports utilisés (3000, 5432, 8080, 8081)
- ✅ Redémarre PostgreSQL (Docker)
- ✅ Vérifie les dépendances Node.js
- ✅ Crée `.env.local` si absent
- ✅ Lance le serveur Next.js en mode développement

**Utilisation :**
```powershell
.\scripts\restart_local.ps1
```

Le serveur sera accessible sur **http://localhost:3000**

## 🛑 `stop_ports.ps1`

Script pour libérer uniquement les ports utilisés.

**Utilisation :**
```powershell
.\scripts\stop_ports.ps1
```

## 📝 Notes

- Assurez-vous d'avoir **Docker** installé si vous utilisez PostgreSQL en local
- Le script vérifie automatiquement si le conteneur `ott-db` existe
- Les ports libérés : 3000 (Next.js), 5432 (PostgreSQL), 8080/8081 (optionnels)

