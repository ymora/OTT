# 🔐 Informations de Connexion - Comptes Admin

## 👥 Comptes Administrateurs

### 🎯 **Yannick Mora**
- **Email** : `ymora@free.fr`
- **Mot de passe** : `Ym120879`
- **Rôle** : Admin complet
- **ID** : 1

### 🎯 **Maxime Happlyz Medical**
- **Email** : `Maxime@happlyzmedical.com`
- **Mot de passe** : `Maxime2024`
- **Rôle** : Admin complet
- **ID** : 2

---

## 🌐 Accès aux environnements

### **Local (Docker)**
- **Dashboard** : http://localhost:3000
- **API** : http://localhost:8080/api.php/health
- **Démarrage** : `npm run dev:docker`

### **Production (Render)**
- **Dashboard** : https://ott-jbln.onrender.com
- **API** : https://ott-jbln.onrender.com/api.php/health
- **Déploiement** : Automatique depuis `main`

---

## 🔧 Vérification en base de données

```sql
SELECT id, email, first_name, last_name, role_id 
FROM users;
```

**Résultat :**
```
id | email                    | first_name | last_name        | role_id
----|--------------------------|------------|------------------|---------
  1 | ymora@free.fr           | Yann       | Mora             |       1
  2 | Maxime@happlyzmedical.com | Maxime     | Happlyz Medical  |       1
```

---

## 🚀 Première connexion

1. **Local** : Démarrer Docker avec `npm run dev:docker`
2. **Se connecter** avec les identifiants ci-dessus
3. **Vérifier** que vous avez bien accès à tout

---

## ⚠️ Sécurité

- Les mots de passe sont hashés avec bcrypt
- Les deux comptes ont toutes les permissions
- Les comptes sont créés automatiquement à l'initialisation
- Les notifications sont configurées pour les deux utilisateurs

---

## 📞 Support

- **Yann** : ymora@free.fr
- **GitHub** : https://github.com/ymora/OTT
- **Issues** : https://github.com/ymora/OTT/issues
