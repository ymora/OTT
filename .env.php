# Variables d'environnement OTT Dashboard
# Ce fichier est chargé automatiquement par bootstrap/env_loader.php
# Ce fichier est ignoré par Git (.gitignore)

# ================================================================================
# BASE DE DONNÉES - PRODUCTION RENDER
# ================================================================================
DATABASE_URL=postgresql://ott_data_user:lxNCXElZadbthGiOgT3cg2Y6JmMeMqUM@dpg-d4b6c015pdvs73ck6rp0-a.frankfurt-postgres.render.com/ott_data
DB_HOST=dpg-d4b6c015pdvs73ck6rp0-a.frankfurt-postgres.render.com
DB_PORT=5432
DB_NAME=ott_data
DB_USER=ott_data_user
DB_PASSWORD=lxNCXElZadbthGiOgT3cg2Y6JmMeMqUM

# ================================================================================
# JWT & SÉCURITÉ
# ================================================================================
JWT_SECRET=happlyz_medical_ott_jwt_secret_2024_production
AUTH_DISABLED=false

# ================================================================================
# APPLICATION
# ================================================================================
APP_ENV=production
DEBUG_ERRORS=true

# ================================================================================
# CORS - PRODUCTION RENDER
# ================================================================================
CORS_ALLOWED_ORIGINS=https://ott-dashboard.onrender.com,https://ott-api-c387.onrender.com

# ================================================================================
# EMAIL & SMS (OPTIONNEL)
# ================================================================================
# SENDGRID_API_KEY=
# SENDGRID_FROM_EMAIL=noreply@happlyz.com
# TWILIO_ACCOUNT_SID=
# TWILIO_AUTH_TOKEN=
# TWILIO_FROM_NUMBER=
