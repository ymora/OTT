#!/usr/bin/env python3
"""
Script de restauration des dispositifs archivés
HAPPLYZ MEDICAL - Décembre 2025
"""

import psycopg2

DATABASE_URL = "postgresql://ott_data_user:lxNCXElZadbthGiOgT3cg2Y6JmMeMqUM@dpg-d4b6c015pdvs73ck6rp0-a.frankfurt-postgres.render.com/ott_data"

print("\n🛟 RESTAURATION DES DISPOSITIFS ARCHIVÉS\n")
print("=" * 60)

try:
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    cur = conn.cursor()
    
    # 1. Lister les dispositifs archivés
    print("🔍 Recherche des dispositifs archivés...")
    cur.execute("""
        SELECT id, device_name, device_serial, sim_iccid, deleted_at
        FROM devices 
        WHERE deleted_at IS NOT NULL
        LIMIT 20
    """)
    archived = cur.fetchall()
    
    if not archived:
        print("✅ Aucun dispositif archivé trouvé - Tout est déjà actif !")
    else:
        print(f"\n📋 Trouvé {len(archived)} dispositif(s) archivé(s):\n")
        for dev in archived:
            print(f"   - ID {dev[0]}: {dev[1]} ({dev[2]}) - Archivé le {dev[4]}")
        
        # 2. Demander confirmation
        print("\n" + "=" * 60)
        response = input("\n❓ Restaurer TOUS ces dispositifs? (oui/non): ").strip().lower()
        
        if response in ['oui', 'o', 'yes', 'y']:
            # 3. Restaurer
            print("\n🔄 Restauration en cours...")
            cur.execute("""
                UPDATE devices 
                SET deleted_at = NULL 
                WHERE deleted_at IS NOT NULL
            """)
            count = cur.rowcount
            
            # 4. Commit
            conn.commit()
            print(f"\n✅ {count} dispositif(s) restauré(s) avec succès !")
            
            # 5. Vérifier
            cur.execute("SELECT COUNT(*) FROM devices WHERE deleted_at IS NULL")
            active_count = cur.fetchone()[0]
            print(f"📊 Total dispositifs actifs maintenant: {active_count}")
            
            print("\n💡 Rechargez votre dashboard (Ctrl+F5) pour voir les changements !")
        else:
            print("\n❌ Restauration annulée")
    
    # Même chose pour patients et utilisateurs si nécessaire
    print("\n" + "=" * 60)
    print("🔍 Vérification patients et utilisateurs...")
    
    cur.execute("SELECT COUNT(*) FROM patients WHERE deleted_at IS NOT NULL")
    archived_patients = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM users WHERE deleted_at IS NOT NULL")
    archived_users = cur.fetchone()[0]
    
    if archived_patients > 0:
        print(f"⚠️ {archived_patients} patient(s) archivé(s) trouvé(s)")
        response = input("❓ Les restaurer aussi? (oui/non): ").strip().lower()
        if response in ['oui', 'o', 'yes', 'y']:
            cur.execute("UPDATE patients SET deleted_at = NULL WHERE deleted_at IS NOT NULL")
            conn.commit()
            print(f"✅ {cur.rowcount} patient(s) restauré(s)")
    
    if archived_users > 0:
        print(f"⚠️ {archived_users} utilisateur(s) archivé(s) trouvé(s)")
        response = input("❓ Les restaurer aussi? (oui/non): ").strip().lower()
        if response in ['oui', 'o', 'yes', 'y']:
            cur.execute("UPDATE users SET deleted_at = NULL WHERE deleted_at IS NOT NULL")
            conn.commit()
            print(f"✅ {cur.rowcount} utilisateur(s) restauré(s)")
    
    cur.close()
    conn.close()
    
    print("\n" + "=" * 60)
    print("✅ RESTAURATION TERMINÉE !")
    print("\n💡 Prochaines étapes:")
    print("   1. Rechargez le dashboard (Ctrl+Shift+R)")
    print("   2. Vérifiez que vos dispositifs/patients apparaissent")
    print("   3. Si tout est OK, on sécurise le bouton Reset Démo")
    
except Exception as e:
    print(f"\n❌ ERREUR: {e}")
    if conn:
        conn.rollback()

