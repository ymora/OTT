# ================================================================================
# Dockerfile - OTT API Backend
# ================================================================================
# HAPPLYZ MEDICAL SAS
# Image PHP 8.2 avec extension PostgreSQL
# ================================================================================

FROM php:8.2-apache

# Installer extensions PHP requises
RUN apt-get update && apt-get install -y \
    libpq-dev \
    && docker-php-ext-install pdo pdo_pgsql \
    && a2enmod rewrite headers \
    && rm -rf /var/lib/apt/lists/*

# Configuration Apache pour PHP
RUN echo "ServerName ott-api" >> /etc/apache2/apache2.conf

# Copier uniquement les fichiers backend nécessaires
COPY api.php /var/www/html/
COPY index.php /var/www/html/
COPY bootstrap /var/www/html/bootstrap
COPY sql /var/www/html/sql
COPY public/DOCUMENTATION_COMPLETE_OTT.html /var/www/html/public/DOCUMENTATION_COMPLETE_OTT.html

# Vérifier que les fichiers critiques sont bien copiés
RUN ls -la /var/www/html/ && head -5 /var/www/html/index.php

# Permissions
RUN chown -R www-data:www-data /var/www/html \
    && chmod -R 755 /var/www/html \
    && chmod 644 /var/www/html/*.php

# Créer dossier firmwares
RUN mkdir -p /var/www/html/firmwares \
    && chown www-data:www-data /var/www/html/firmwares

# Activer affichage erreurs PHP (pour debug)
RUN echo "display_errors = On" >> /usr/local/etc/php/php.ini \
    && echo "error_reporting = E_ALL" >> /usr/local/etc/php/php.ini

# Port exposé
EXPOSE 80

# Démarrer Apache
CMD ["apache2-foreground"]

