#!/usr/bin/env python3
"""
Vérifier les VIEWs de la base de données
"""

import psycopg2

DATABASE_URL = "postgresql://ott_data_user:lxNCXElZadbthGiOgT3cg2Y6JmMeMqUM@dpg-d4b6c015pdvs73ck6rp0-a.frankfurt-postgres.render.com/ott_data"

print("\n🔍 VÉRIFICATION DES VIEWS\n")
print("=" * 60)

try:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    
    # Vérifier si la VIEW users_with_roles existe
    print("📋 Recherche de la VIEW 'users_with_roles'...")
    cur.execute("""
        SELECT 
            schemaname,
            viewname,
            definition
        FROM pg_views
        WHERE viewname = 'users_with_roles'
    """)
    
    view = cur.fetchone()
    
    if view:
        print(f"✅ VIEW 'users_with_roles' existe !")
        print(f"\n📝 Définition:")
        print(view[2])
    else:
        print("❌ VIEW 'users_with_roles' N'EXISTE PAS !")
        print("\n💡 C'est pour ça que l'API plante !")
        print("\n🔧 Solution : Créer la VIEW")
    
    # Lister toutes les views
    print("\n" + "=" * 60)
    print("📋 Toutes les VIEWs disponibles:")
    cur.execute("""
        SELECT viewname
        FROM pg_views
        WHERE schemaname = 'public'
        ORDER BY viewname
    """)
    
    views = cur.fetchall()
    if views:
        for v in views:
            print(f"   - {v[0]}")
    else:
        print("   Aucune VIEW trouvée")
    
    cur.close()
    conn.close()
    
    print("\n" + "=" * 60)
    
except Exception as e:
    print(f"\n❌ ERREUR: {e}")
    raise

