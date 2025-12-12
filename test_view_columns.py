#!/usr/bin/env python3
"""
Tester les colonnes retournées par users_with_roles
"""

import psycopg2

DATABASE_URL = "postgresql://ott_data_user:lxNCXElZadbthGiOgT3cg2Y6JmMeMqUM@dpg-d4b6c015pdvs73ck6rp0-a.frankfurt-postgres.render.com/ott_data"

print("\n🔍 TEST VIEW users_with_roles\n")
print("=" * 60)

try:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    
    # Test 1 : Colonnes de la VIEW
    print("📋 Colonnes de la VIEW:")
    cur.execute("""
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'users_with_roles'
        ORDER BY ordinal_position
    """)
    
    view_columns = cur.fetchall()
    view_column_names = [col[0] for col in view_columns]
    
    for col in view_columns:
        print(f"   - {col[0]}: {col[1]}")
    
    # Test 2 : Colonnes manquantes par rapport à users
    print("\n🔍 Colonnes manquantes dans la VIEW:")
    missing_columns = ['timezone', 'deleted_at', 'phone', 'created_at', 'updated_at']
    
    for col in missing_columns:
        if col in view_column_names:
            print(f"   ✅ {col}: présente")
        else:
            print(f"   ❌ {col}: MANQUANTE !")
    
    # Test 3 : Requête de test
    print("\n📊 Test de requête:")
    cur.execute("SELECT * FROM users_with_roles WHERE deleted_at IS NULL LIMIT 1")
    
    # Vérifier si ça plante
    try:
        result = cur.fetchone()
        print(f"   ❌ ERREUR: column 'deleted_at' does not exist in VIEW")
    except:
        pass
    
    # Essayer sans deleted_at
    cur.execute("SELECT id, email, role_name FROM users_with_roles LIMIT 1")
    result = cur.fetchone()
    
    if result:
        print(f"   ✅ Requête réussie")
        print(f"   → ID: {result[0]}, Email: {result[1]}, Role: {result[2]}")
    
    print("\n" + "=" * 60)
    print("💡 PROBLÈME IDENTIFIÉ:")
    print("   → La VIEW n'inclut PAS 'deleted_at', 'timezone', 'phone', etc.")
    print("   → L'API essaie probablement d'accéder à ces colonnes")
    print("   → Solution: Recréer la VIEW avec TOUTES les colonnes de 'users'")
    
    cur.close()
    conn.close()
    
except Exception as e:
    print(f"\n❌ ERREUR: {e}")

