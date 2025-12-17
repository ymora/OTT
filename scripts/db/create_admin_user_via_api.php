<?php
/**
 * Script PHP pour créer un utilisateur admin via l'API
 * Alternative si psql n'est pas disponible
 * 
 * Usage: php scripts/db/create_admin_user_via_api.php
 */

require_once __DIR__ . '/../../bootstrap/database.php';
require_once __DIR__ . '/../../api/helpers.php';

// Configuration
$email = getenv('ADMIN_EMAIL') ?: 'ymora@free.fr';
$password = getenv('ADMIN_PASSWORD') ?: 'Ym120879';
$firstName = getenv('ADMIN_FIRST_NAME') ?: 'Yann';
$lastName = getenv('ADMIN_LAST_NAME') ?: 'Mora';
$phone = getenv('ADMIN_PHONE') ?: '';

echo "👤 Création de l'utilisateur admin via l'API\n";
echo "=" . str_repeat("=", 70) . "\n\n";

try {
    // Vérifier que la connexion à la base de données fonctionne
    global $pdo;
    if (!$pdo) {
        throw new Exception("Connexion à la base de données échouée");
    }
    
    echo "✅ Connexion à la base de données réussie\n\n";
    
    // Vérifier que le rôle admin existe
    echo "🔍 Vérification du rôle admin...\n";
    $roleStmt = $pdo->query("SELECT id FROM roles WHERE name = 'admin' LIMIT 1");
    $role = $roleStmt->fetch();
    
    if (!$role) {
        throw new Exception("Le rôle 'admin' n'existe pas. Assurez-vous d'avoir appliqué le schéma SQL (sql/schema.sql) d'abord.");
    }
    
    $roleId = $role['id'];
    echo "✅ Rôle admin trouvé (ID: $roleId)\n\n";
    
    // Vérifier si l'utilisateur existe déjà
    echo "🔍 Vérification si l'utilisateur existe déjà...\n";
    $userStmt = $pdo->prepare("SELECT id FROM users WHERE email = :email LIMIT 1");
    $userStmt->execute(['email' => $email]);
    $existingUser = $userStmt->fetch();
    
    if ($existingUser) {
        echo "⚠️  L'utilisateur existe déjà (ID: {$existingUser['id']})\n";
        echo "🔄 Mise à jour du mot de passe et du rôle...\n";
        
        // Hasher le mot de passe
        $passwordHash = password_hash($password, PASSWORD_BCRYPT);
        
        // Mettre à jour l'utilisateur
        $updateStmt = $pdo->prepare("
            UPDATE users 
            SET password_hash = :password_hash, 
                is_active = TRUE, 
                role_id = :role_id,
                first_name = :first_name,
                last_name = :last_name,
                phone = :phone
            WHERE email = :email
        ");
        $updateStmt->execute([
            'email' => $email,
            'password_hash' => $passwordHash,
            'role_id' => $roleId,
            'first_name' => $firstName,
            'last_name' => $lastName,
            'phone' => $phone ?: null
        ]);
        
        echo "✅ Utilisateur mis à jour avec succès !\n";
    } else {
        // Créer l'utilisateur
        echo "📝 Création de l'utilisateur admin...\n";
        echo "   Email: $email\n";
        echo "   Nom: $firstName $lastName\n";
        echo "   Rôle: admin\n\n";
        
        // Hasher le mot de passe
        $passwordHash = password_hash($password, PASSWORD_BCRYPT);
        
        // Insérer l'utilisateur
        $insertStmt = $pdo->prepare("
            INSERT INTO users (email, password_hash, first_name, last_name, phone, role_id, is_active)
            VALUES (:email, :password_hash, :first_name, :last_name, :phone, :role_id, TRUE)
        ");
        $insertStmt->execute([
            'email' => $email,
            'password_hash' => $passwordHash,
            'first_name' => $firstName,
            'last_name' => $lastName,
            'phone' => $phone ?: null,
            'role_id' => $roleId
        ]);
        
        echo "✅ Utilisateur admin créé avec succès !\n";
    }
    
    echo "\n";
    echo "📋 Informations de connexion:\n";
    echo "   Email: $email\n";
    echo "   Mot de passe: $password\n";
    echo "   Rôle: admin\n";
    echo "\n";
    echo "💡 Vous pouvez maintenant vous connecter à l'API avec ces identifiants\n";
    
} catch (PDOException $e) {
    echo "❌ Erreur de base de données: " . $e->getMessage() . "\n";
    exit(1);
} catch (Exception $e) {
    echo "❌ Erreur: " . $e->getMessage() . "\n";
    exit(1);
}

