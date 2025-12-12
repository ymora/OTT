#!/usr/bin/env python3
"""
Recréer la VIEW users_with_roles avec toutes les colonnes
"""

import psycopg2

DATABASE_URL = "postgresql://ott_data_user:lxNCXElZadbthGiOgT3cg2Y6JmMeMqUM@dpg-d4b6c015pdvs73ck6rp0-a.frankfurt-postgres.render.com/ott_data"

print("\n🔧 CORRECTION VIEW users_with_roles\n")
print("=" * 60)

try:
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    cur = conn.cursor()
    
    print("1️⃣ Suppression de l'ancienne VIEW...")
    cur.execute("DROP VIEW IF EXISTS users_with_roles CASCADE")
    print("   ✅ Ancienne VIEW supprimée")
    
    print("\n2️⃣ Création de la nouvelle VIEW (avec TOUTES les colonnes)...")
    cur.execute("""
        CREATE VIEW users_with_roles AS
        SELECT 
            u.id,
            u.email,
            u.first_name,
            u.last_name,
            u.password_hash,
            u.role_id,
            u.is_active,
            u.last_login,
            u.created_at,
            u.updated_at,
            u.timezone,
            u.deleted_at,
            u.phone,
            r.name AS role_name,
            r.description AS role_description,
            string_agg(p.code::text, ','::text) AS permissions
        FROM users u
        JOIN roles r ON u.role_id = r.id
        LEFT JOIN role_permissions rp ON r.id = rp.role_id
        LEFT JOIN permissions p ON rp.permission_id = p.id
        GROUP BY u.id, u.email, u.first_name, u.last_name, u.password_hash, 
                 u.role_id, u.is_active, u.last_login, u.created_at, u.updated_at,
                 u.timezone, u.deleted_at, u.phone, r.name, r.description
    """)
    print("   ✅ Nouvelle VIEW créée")
    
    conn.commit()
    
    print("\n3️⃣ Test de la nouvelle VIEW...")
    cur.execute("""
        SELECT id, email, role_name, deleted_at, timezone, phone
        FROM users_with_roles
        WHERE deleted_at IS NULL
        LIMIT 3
    """)
    
    users = cur.fetchall()
    print(f"   ✅ Requête réussie ! {len(users)} utilisateur(s) trouvé(s)")
    
    for user in users:
        print(f"      - {user[1]} (role: {user[2]}, deleted_at: {user[3]})")
    
    cur.close()
    conn.close()
    
    print("\n" + "=" * 60)
    print("✅ VIEW CORRIGÉE AVEC SUCCÈS !")
    print("\n💡 Prochaines étapes:")
    print("   1. Rechargez le dashboard (Ctrl+Shift+R)")
    print("   2. Toutes les erreurs 500 devraient disparaître")
    print("   3. Vos données devraient s'afficher correctement")
    
except Exception as e:
    print(f"\n❌ ERREUR: {e}")
    if 'conn' in locals():
        conn.rollback()
    raise

