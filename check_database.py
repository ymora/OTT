#!/usr/bin/env python3
"""
Script de diagnostic base de données PostgreSQL
HAPPLYZ MEDICAL - Décembre 2025
"""

import psycopg2
import sys

# Connexion string
DATABASE_URL = "postgresql://ott_data_user:lxNCXElZadbthGiOgT3cg2Y6JmMeMqUM@dpg-d4b6c015pdvs73ck6rp0-a.frankfurt-postgres.render.com/ott_data"

print("\n🔍 DIAGNOSTIC BASE DE DONNÉES OTT\n")
print("=" * 60)

try:
    # Connexion
    print("📡 Connexion à PostgreSQL...")
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    print("✅ Connexion réussie !\n")
    
    # Requête de diagnostic
    query = """
    SELECT 
        (SELECT COUNT(*) FROM users) as users_total,
        (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) as users_actifs,
        (SELECT COUNT(*) FROM patients) as patients_total,
        (SELECT COUNT(*) FROM patients WHERE deleted_at IS NULL) as patients_actifs,
        (SELECT COUNT(*) FROM devices) as devices_total,
        (SELECT COUNT(*) FROM devices WHERE deleted_at IS NULL) as devices_actifs,
        (SELECT COUNT(*) FROM measurements) as mesures_total,
        (SELECT COUNT(*) FROM device_logs) as logs_total,
        (SELECT COUNT(*) FROM user_notifications_preferences) as notif_users,
        (SELECT COUNT(*) FROM patient_notifications_preferences) as notif_patients
    """
    
    cur.execute(query)
    result = cur.fetchone()
    
    print("📊 RÉSULTATS DU COMPTAGE:\n")
    print(f"👥 Utilisateurs:")
    print(f"   - Total: {result[0]}")
    print(f"   - Actifs: {result[1]}")
    print(f"\n🏥 Patients:")
    print(f"   - Total: {result[2]}")
    print(f"   - Actifs: {result[3]}")
    print(f"\n📱 Dispositifs:")
    print(f"   - Total: {result[4]}")
    print(f"   - Actifs: {result[5]}")
    print(f"\n📈 Mesures: {result[6]}")
    print(f"📋 Logs: {result[7]}")
    print(f"🔔 Notif users: {result[8]}")
    print(f"🔔 Notif patients: {result[9]}")
    
    print("\n" + "=" * 60)
    
    # Analyse
    if result[1] == 0 and result[3] == 0 and result[5] == 0:
        print("\n❌ DIAGNOSTIC: TOUTES LES DONNÉES ACTIVES SONT VIDES !")
        print("\n🔍 Cause probable:")
        print("   → Reset Demo exécuté (TRUNCATE de toutes les tables)")
        print("\n🛟 Solutions:")
        print("   1. Restaurer backup Render (dashboard.render.com → DB → Backups)")
        print("   2. Vérifier s'il y a des données archivées (deleted_at NOT NULL)")
        print("   3. Recréer les données manuellement")
        
        # Vérifier les archives
        print("\n🔍 Vérification des archives...")
        cur.execute("SELECT COUNT(*) FROM users WHERE deleted_at IS NOT NULL")
        archived_users = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM patients WHERE deleted_at IS NOT NULL")
        archived_patients = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM devices WHERE deleted_at IS NOT NULL")
        archived_devices = cur.fetchone()[0]
        
        if archived_users > 0 or archived_patients > 0 or archived_devices > 0:
            print(f"\n✅ TROUVÉ DES ARCHIVES !")
            print(f"   - Users archivés: {archived_users}")
            print(f"   - Patients archivés: {archived_patients}")
            print(f"   - Devices archivés: {archived_devices}")
            print("\n💡 On peut restaurer ces données en mettant deleted_at = NULL")
        
    elif result[1] > 0:
        print("\n✅ DIAGNOSTIC: DES DONNÉES EXISTENT !")
        print(f"\n📊 Trouvé:")
        print(f"   - {result[1]} utilisateur(s) actif(s)")
        print(f"   - {result[3]} patient(s) actif(s)")
        print(f"   - {result[5]} dispositif(s) actif(s)")
        print("\n💡 Le problème vient probablement du dashboard, pas de la DB")
        
        # Lister les utilisateurs
        print("\n👥 Utilisateurs actifs:")
        cur.execute("SELECT id, email, role_name FROM users WHERE deleted_at IS NULL LIMIT 5")
        for user in cur.fetchall():
            print(f"   - ID {user[0]}: {user[1]} ({user[2]})")
    
    cur.close()
    conn.close()
    print("\n✅ Diagnostic terminé")
    
except psycopg2.Error as e:
    print(f"\n❌ ERREUR PostgreSQL: {e}")
    print("\n💡 Vérifiez:")
    print("   - Connexion Internet")
    print("   - Firewall/VPN")
    print("   - Credentials DATABASE_URL")
    sys.exit(1)
except Exception as e:
    print(f"\n❌ ERREUR: {e}")
    sys.exit(1)

