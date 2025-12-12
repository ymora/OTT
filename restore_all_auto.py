#!/usr/bin/env python3
"""
Script de restauration automatique (sans confirmation)
HAPPLYZ MEDICAL - Décembre 2025
"""

import psycopg2

DATABASE_URL = "postgresql://ott_data_user:lxNCXElZadbthGiOgT3cg2Y6JmMeMqUM@dpg-d4b6c015pdvs73ck6rp0-a.frankfurt-postgres.render.com/ott_data"

print("\n🛟 RESTAURATION AUTOMATIQUE DES DONNÉES ARCHIVÉES\n")
print("=" * 60)

try:
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    cur = conn.cursor()
    
    # 1. Dispositifs
    print("\n🔄 Restauration des dispositifs...")
    cur.execute("SELECT COUNT(*) FROM devices WHERE deleted_at IS NOT NULL")
    archived_devices = cur.fetchone()[0]
    
    if archived_devices > 0:
        print(f"   Trouvé: {archived_devices} dispositif(s) archivé(s)")
        cur.execute("UPDATE devices SET deleted_at = NULL WHERE deleted_at IS NOT NULL")
        conn.commit()
        print(f"   ✅ {cur.rowcount} dispositif(s) restauré(s)")
    else:
        print("   ✅ Aucun dispositif archivé")
    
    # 2. Patients
    print("\n🔄 Restauration des patients...")
    cur.execute("SELECT COUNT(*) FROM patients WHERE deleted_at IS NOT NULL")
    archived_patients = cur.fetchone()[0]
    
    if archived_patients > 0:
        print(f"   Trouvé: {archived_patients} patient(s) archivé(s)")
        cur.execute("UPDATE patients SET deleted_at = NULL WHERE deleted_at IS NOT NULL")
        conn.commit()
        print(f"   ✅ {cur.rowcount} patient(s) restauré(s)")
    else:
        print("   ✅ Aucun patient archivé")
    
    # 3. Utilisateurs
    print("\n🔄 Restauration des utilisateurs...")
    cur.execute("SELECT COUNT(*) FROM users WHERE deleted_at IS NOT NULL")
    archived_users = cur.fetchone()[0]
    
    if archived_users > 0:
        print(f"   Trouvé: {archived_users} utilisateur(s) archivé(s)")
        cur.execute("UPDATE users SET deleted_at = NULL WHERE deleted_at IS NOT NULL")
        conn.commit()
        print(f"   ✅ {cur.rowcount} utilisateur(s) restauré(s)")
    else:
        print("   ✅ Aucun utilisateur archivé")
    
    # 4. Vérification finale
    print("\n" + "=" * 60)
    print("📊 ÉTAT FINAL DE LA BASE:")
    cur.execute("""
        SELECT 
            (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) as users,
            (SELECT COUNT(*) FROM patients WHERE deleted_at IS NULL) as patients,
            (SELECT COUNT(*) FROM devices WHERE deleted_at IS NULL) as devices,
            (SELECT COUNT(*) FROM measurements) as mesures
    """)
    final = cur.fetchone()
    print(f"\n   👥 Utilisateurs actifs: {final[0]}")
    print(f"   🏥 Patients actifs: {final[1]}")
    print(f"   📱 Dispositifs actifs: {final[2]}")
    print(f"   📈 Mesures totales: {final[3]}")
    
    cur.close()
    conn.close()
    
    print("\n" + "=" * 60)
    print("✅ RESTAURATION TERMINÉE AVEC SUCCÈS !")
    print("\n💡 PROCHAINES ÉTAPES:")
    print("   1. Rechargez le dashboard: Ctrl+Shift+R (force refresh)")
    print("   2. Vérifiez que vos données apparaissent")
    print("   3. Si tout est OK, je sécurise le bouton Reset Démo")
    
except Exception as e:
    print(f"\n❌ ERREUR: {e}")
    if 'conn' in locals():
        conn.rollback()
    raise

