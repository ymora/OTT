#!/usr/bin/env python3
"""
Script de diagnostic et réparation du schéma
HAPPLYZ MEDICAL - Décembre 2025
"""

import psycopg2

DATABASE_URL = "postgresql://ott_data_user:lxNCXElZadbthGiOgT3cg2Y6JmMeMqUM@dpg-d4b6c015pdvs73ck6rp0-a.frankfurt-postgres.render.com/ott_data"

print("\n🔍 DIAGNOSTIC SCHÉMA BASE DE DONNÉES\n")
print("=" * 60)

try:
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    cur = conn.cursor()
    
    print("✅ Connexion réussie\n")
    
    # 1. Vérifier la structure de la table users
    print("📋 Structure de la table 'users':")
    cur.execute("""
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'users'
        ORDER BY ordinal_position
    """)
    
    columns = cur.fetchall()
    user_columns = [col[0] for col in columns]
    
    for col in columns:
        print(f"   - {col[0]}: {col[1]} (nullable: {col[2]})")
    
    # 2. Vérifier si role_name existe
    print(f"\n🔍 Vérification 'role_name':")
    if 'role_name' in user_columns:
        print("   ✅ Colonne 'role_name' existe")
    else:
        print("   ❌ Colonne 'role_name' MANQUANTE")
        print("   💡 Colonnes role disponibles:", [c for c in user_columns if 'role' in c.lower()])
    
    # 3. Vérifier la table roles
    print(f"\n📋 Tables de rôles:")
    cur.execute("SELECT COUNT(*) FROM roles")
    roles_count = cur.fetchone()[0]
    print(f"   - Table 'roles': {roles_count} enregistrement(s)")
    
    # 4. Vérifier si les users ont un lien avec roles
    if 'role_id' in user_columns:
        print("   ✅ Colonne 'role_id' trouvée - Relation via FK")
        # Essayer de récupérer role_name via JOIN
        try:
            cur.execute("""
                SELECT u.id, u.email, r.name as role_name
                FROM users u
                LEFT JOIN roles r ON u.role_id = r.id
                WHERE u.deleted_at IS NULL
                LIMIT 3
            """)
            users = cur.fetchall()
            print(f"\n👥 Utilisateurs (avec JOIN sur roles):")
            for user in users:
                print(f"   - ID {user[0]}: {user[1]} (role: {user[2]})")
        except Exception as e:
            print(f"   ❌ Erreur JOIN: {e}")
    
    # 5. Vérifier les autres tables critiques
    print(f"\n📋 Vérification tables critiques:")
    critical_tables = ['devices', 'patients', 'measurements', 'roles', 'permissions', 'role_permissions']
    
    for table in critical_tables:
        try:
            cur.execute(f"SELECT COUNT(*) FROM {table}")
            count = cur.fetchone()[0]
            print(f"   ✅ {table}: {count} enregistrement(s)")
        except Exception as e:
            print(f"   ❌ {table}: ERREUR - {e}")
    
    cur.close()
    conn.close()
    
    print("\n" + "=" * 60)
    print("✅ DIAGNOSTIC TERMINÉ")
    
    # Recommandation
    print("\n💡 RECOMMANDATION:")
    if 'role_name' not in user_columns and 'role_id' in user_columns:
        print("   → Le schéma utilise role_id (FK vers roles)")
        print("   → L'API doit faire un JOIN pour obtenir role_name")
        print("   → Ceci est NORMAL et CORRECT en 2025 (normalisation DB)")
        print("\n   ⚠️ PROBLÈME: L'API ne fait probablement PAS le JOIN")
        print("   → Il faut modifier les requêtes SQL pour ajouter le JOIN")
    
except Exception as e:
    print(f"\n❌ ERREUR: {e}")
    raise

