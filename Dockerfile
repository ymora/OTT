# ================================================================================
# Dockerfile - OTT API Backend
# ================================================================================
# HAPPLYZ MEDICAL SAS
# Image PHP 8.2 avec extensions PostgreSQL et MySQL
# ================================================================================

FROM php:8.2-apache

# Installer extensions PHP requises
RUN apt-get update && apt-get install -y \
    libpq-dev \
    && docker-php-ext-install pdo pdo_pgsql pdo_mysql \
    && a2enmod rewrite headers \
    && rm -rf /var/lib/apt/lists/*

# Configuration Apache pour PHP
RUN echo "ServerName ott-api" >> /etc/apache2/apache2.conf

# Copier les fichiers de l'application
COPY . /var/www/html/

# Vérifier que index.php existe et fonctionne
RUN ls -la /var/www/html/ && cat /var/www/html/index.php | head -5

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

