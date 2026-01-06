# ================================================================================
# Dockerfile - OTT API Backend
# ================================================================================
# HAPPLYZ MEDICAL SAS
# Image PHP 8.2 avec extension PostgreSQL
# ================================================================================

FROM php:8.2-apache

# Installer extensions PHP requises, client PostgreSQL et arduino-cli
RUN apt-get update && apt-get install -y \
    libpq-dev \
    postgresql-client \
    curl \
    unzip \
    && docker-php-ext-install pdo pdo_pgsql \
    && a2enmod rewrite headers \
    && rm -rf /var/lib/apt/lists/*

# Installer arduino-cli (OBLIGATOIRE - compilation jamais simulée)
# Note: Le binaire local dans bin/ est pour le développement local, pas pour Docker
# Dans Docker, on télécharge toujours arduino-cli depuis le script officiel
RUN curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh && \
    mv bin/arduino-cli /usr/local/bin/arduino-cli && \
    chmod +x /usr/local/bin/arduino-cli && \
    rm -rf bin && \
    arduino-cli version || (echo "ERREUR CRITIQUE: arduino-cli n'a pas pu etre installe" && exit 1)

# Installer le core ESP32 et ses tools au build (évite les timeouts au runtime)
# Cela ajoute ~500MB à l'image mais permet la compilation immédiate
RUN mkdir -p /var/www/html/.arduino15 && \
    arduino-cli config init --dest-dir /var/www/html/.arduino15 && \
    arduino-cli config add board_manager.additional_urls https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json --config-file /var/www/html/.arduino15/arduino-cli.yaml && \
    arduino-cli core update-index --config-file /var/www/html/.arduino15/arduino-cli.yaml && \
    arduino-cli core install esp32:esp32@3.3.4 --config-file /var/www/html/.arduino15/arduino-cli.yaml && \
    arduino-cli lib install ArduinoJson@7.0.4 --config-file /var/www/html/.arduino15/arduino-cli.yaml && \
    chown -R www-data:www-data /var/www/html/.arduino15 && \
    echo "✅ ESP32 core et tools installes"

# Configuration Apache pour PHP
RUN echo "ServerName ott-api" >> /etc/apache2/apache2.conf

# Copier uniquement les fichiers backend nécessaires
COPY api.php /var/www/html/
COPY index.php /var/www/html/
COPY .htaccess /var/www/html/.htaccess
COPY api /var/www/html/api
COPY bootstrap /var/www/html/bootstrap
COPY sql /var/www/html/sql
COPY hardware /var/www/html/hardware
COPY scripts /var/www/html/scripts
# Note: arduino-data/ n'est pas copié car volumineux (~430MB) et chemins trop longs
# Le core ESP32 sera téléchargé une seule fois lors de la première compilation
# Note: bin/ n'est pas copié ici car arduino-cli est installé dans le RUN précédent

# Créer le dossier public (pour les fichiers statiques si nécessaire)
RUN mkdir -p /var/www/html/public

# Note: Les fichiers de documentation HTML ne sont pas copiés car non critiques pour l'API
# Ils sont exclus par .dockerignore pour optimiser la taille de l'image

# Vérifier que les fichiers critiques sont bien copiés
RUN ls -la /var/www/html/ && head -5 /var/www/html/index.php

# Permissions
RUN chown -R www-data:www-data /var/www/html \
    && chmod -R 755 /var/www/html \
    && chmod 644 /var/www/html/*.php \
    && chmod +x /var/www/html/scripts/start_api_with_migration.sh \
    && chmod +x /var/www/html/scripts/db/init_database.sh || true

# Créer dossier hardware/firmware pour les firmwares compilés
RUN mkdir -p /var/www/html/hardware/firmware/v3.0 \
    && chown -R www-data:www-data /var/www/html/hardware

# Désactiver affichage erreurs PHP en production (pour éviter HTML dans JSON)
# Les erreurs sont loggées mais pas affichées
RUN echo "display_errors = Off" >> /usr/local/etc/php/php.ini \
    && echo "display_startup_errors = Off" >> /usr/local/etc/php/php.ini \
    && echo "error_reporting = E_ALL" >> /usr/local/etc/php/php.ini \
    && echo "log_errors = On" >> /usr/local/etc/php/php.ini

# Port exposé
EXPOSE 80

# Démarrer Apache
CMD ["apache2-foreground"]

