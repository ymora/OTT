# Guide d'Unification Users/Patients

## 📋 Principe Fondamental

**TOUTE fonctionnalité implémentée pour Users DOIT être implémentée pour Patients (et vice versa), sauf différences métier explicites.**

## ✅ Checklist d'Unification

Avant de créer ou modifier une fonction pour Users ou Patients, vérifier :

### 1. Création (handleCreate*)
- [ ] Création des préférences de notifications par défaut
- [ ] Vérification de l'existence des tables avant insertion
- [ ] Gestion d'erreurs avec logging détaillé
- [ ] Audit log avec même format
- [ ] Retour JSON avec même structure

### 2. Modification (handleUpdate*)
- [ ] Vérification de l'existence de l'entité (404 si non trouvé)
- [ ] Gestion des champs optionnels/nullables identique
- [ ] Retour de l'entité mise à jour complète
- [ ] Audit log avec old_value et new_value
- [ ] Gestion d'erreurs avec logging détaillé

### 3. Suppression (handleDelete*)
- [ ] Vérification de l'existence de l'entité
- [ ] Vérification des dépendances (devices, etc.)
- [ ] Suppression des préférences de notifications associées
- [ ] Gestion d'erreurs avec try/catch pour tables optionnelles
- [ ] Audit log

### 4. Notifications (handle*Notifications)
- [ ] Vérification de l'existence de la table notifications
- [ ] Retour de valeurs par défaut si table n'existe pas
- [ ] Création automatique des préférences si absentes
- [ ] Tous les champs d'alertes inclus dans les INSERT
- [ ] Conversion booléenne identique (TRUE/FALSE pour PostgreSQL)
- [ ] Gestion d'erreurs avec codes HTTP appropriés (503 si table absente)

### 5. Gestion d'Erreurs
- [ ] Codes HTTP cohérents (400, 404, 422, 500, 503)
- [ ] Messages d'erreur en français
- [ ] Logging détaillé si DEBUG_ERRORS=true
- [ ] Messages d'erreur génériques en production

### 6. Retour de Données
- [ ] Format JSON identique : `{success: true, [entity]: {...}}`
- [ ] Tous les champs pertinents retournés
- [ ] Pas de password_hash dans les réponses

## 🔄 Différences Métier Acceptées

### Users uniquement
- `role_id` et `is_active`
- `password_hash` (gestion mot de passe)
- `notify_new_patient` (alerte nouveau patient)

### Patients uniquement
- `birth_date`, `city`, `postal_code`, `address`, `notes`
- `notify_alert_critical` (alerte critique)

## 📝 Exemples de Patterns Unifiés

### Pattern Création
```php
function handleCreateUser() {
    // ... validation ...
    try {
        // INSERT principal
        $entity = $stmt->fetch();
        
        // Créer préférences notifications (unifié)
        try {
            $checkStmt = $pdo->query("SELECT EXISTS (...)");
            $hasTable = $checkStmt->fetchColumn();
            if ($hasTable === true || $hasTable === 't' || $hasTable === 1 || $hasTable === '1') {
                $pdo->prepare("INSERT INTO ..._notifications_preferences (...) VALUES (...)")
                    ->execute([...]);
            }
        } catch(PDOException $e) {
            if (getenv('DEBUG_ERRORS') === 'true') {
                error_log('[handleCreateUser] Could not create notification preferences: ' . $e->getMessage());
            }
        }
        
        auditLog('user.created', 'user', $entity['id'], null, $entity);
        echo json_encode(['success' => true, 'user' => $entity]);
    } catch(PDOException $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        error_log('[handleCreateUser] Database error: ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}
```

### Pattern Vérification Table
```php
// Vérifier si la table existe (unifié)
$hasNotificationsTable = false;
try {
    $checkStmt = $pdo->query("
        SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = 'user_notifications_preferences'
        )
    ");
    $result = $checkStmt->fetchColumn();
    $hasNotificationsTable = ($result === true || $result === 't' || $result === 1 || $result === '1');
} catch(PDOException $e) {
    $hasNotificationsTable = false;
    if (getenv('DEBUG_ERRORS') === 'true') {
        error_log('[functionName] Table check failed: ' . $e->getMessage());
    }
}
```

## ⚠️ Points d'Attention

1. **Toujours vérifier l'existence des tables** avant de les utiliser (migration progressive)
2. **Toujours inclure tous les champs d'alertes** dans les INSERT de préférences
3. **Toujours utiliser FALSE par défaut** pour les notifications (pas TRUE)
4. **Toujours logger les erreurs** avec le nom de la fonction
5. **Toujours retourner l'entité complète** après modification

## 🔍 Vérification Post-Implémentation

Après avoir implémenté une fonctionnalité, vérifier :
1. La fonction équivalente existe pour l'autre entité (User/Patient)
2. Les deux fonctions ont la même structure
3. Les deux fonctions gèrent les erreurs de la même manière
4. Les deux fonctions retournent les mêmes types de données
5. Les tests fonctionnent pour les deux entités

