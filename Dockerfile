# ================================================================================
# Dockerfile - OTT API Backend
# ================================================================================
# HAPPLYZ MEDICAL SAS
# Image PHP 8.2 avec extension PostgreSQL
# ================================================================================

FROM php:8.2-apache

# Installer extensions PHP requises et arduino-cli
RUN apt-get update && apt-get install -y \
    libpq-dev \
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

# Configuration Apache pour PHP
RUN echo "ServerName ott-api" >> /etc/apache2/apache2.conf

# Copier uniquement les fichiers backend nécessaires
COPY api.php /var/www/html/
COPY index.php /var/www/html/
COPY .htaccess /var/www/html/.htaccess
COPY bootstrap /var/www/html/bootstrap
COPY sql /var/www/html/sql
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
    && chmod 644 /var/www/html/*.php

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

