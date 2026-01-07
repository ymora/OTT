# ================================================================
# OTT API - Dockerfile Production
# ================================================================
# Image PHP 8.2 avec Apache pour l'API backend
# Optimisé pour Render.com et environnements cloud
# ================================================================

FROM php:8.2-apache

# Métadonnées
LABEL maintainer="HAPPLYZ MEDICAL <support@happlyz.com>"
LABEL version="3.1.0"
LABEL description="OTT API Backend - Dispositif Médical IoT"

# Variables d'environnement
ENV APACHE_DOCUMENT_ROOT=/var/www/html
ENV PHP_MEMORY_LIMIT=512M
ENV PHP_MAX_EXECUTION_TIME=120
ENV PHP_UPLOAD_MAX_FILESIZE=100M
ENV PHP_POST_MAX_SIZE=100M

# Installation des dépendances système
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    unzip \
    python3 \
    python3-pip \
    libpq-dev \
    libzip-dev \
    libpng-dev \
    libjpeg-dev \
    libfreetype6-dev \
    libonig-dev \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Installation des extensions PHP
RUN docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j$(nproc) \
    pdo \
    pdo_pgsql \
    pgsql \
    zip \
    gd \
    mbstring \
    opcache

# Configuration Apache
RUN a2enmod rewrite headers

# Configuration PHP personnalisée
RUN echo "memory_limit = ${PHP_MEMORY_LIMIT}" > /usr/local/etc/php/conf.d/custom.ini \
    && echo "max_execution_time = ${PHP_MAX_EXECUTION_TIME}" >> /usr/local/etc/php/conf.d/custom.ini \
    && echo "upload_max_filesize = ${PHP_UPLOAD_MAX_FILESIZE}" >> /usr/local/etc/php/conf.d/custom.ini \
    && echo "post_max_size = ${PHP_POST_MAX_SIZE}" >> /usr/local/etc/php/conf.d/custom.ini \
    && echo "display_errors = Off" >> /usr/local/etc/php/conf.d/custom.ini \
    && echo "log_errors = On" >> /usr/local/etc/php/conf.d/custom.ini

# Configuration OPcache pour production
RUN echo "opcache.enable=1" > /usr/local/etc/php/conf.d/opcache.ini \
    && echo "opcache.memory_consumption=128" >> /usr/local/etc/php/conf.d/opcache.ini \
    && echo "opcache.interned_strings_buffer=8" >> /usr/local/etc/php/conf.d/opcache.ini \
    && echo "opcache.max_accelerated_files=4000" >> /usr/local/etc/php/conf.d/opcache.ini \
    && echo "opcache.validate_timestamps=1" >> /usr/local/etc/php/conf.d/opcache.ini \
    && echo "opcache.revalidate_freq=0" >> /usr/local/etc/php/conf.d/opcache.ini

# Configuration Apache VirtualHost - utilise PORT environment variable
RUN echo '<VirtualHost *:80>\n\
    ServerName localhost\n\
    DocumentRoot /var/www/html\n\
    <Directory /var/www/html>\n\
        AllowOverride All\n\
        Require all granted\n\
        Options -Indexes +FollowSymLinks\n\
    </Directory>\n\
    ErrorLog ${APACHE_LOG_DIR}/error.log\n\
    CustomLog ${APACHE_LOG_DIR}/access.log combined\n\
</VirtualHost>' > /etc/apache2/sites-available/000-default.conf

# Copier le code source et scripts
WORKDIR /var/www/html
COPY api.php .
COPY api/ ./api/
COPY bootstrap/ ./bootstrap/
COPY router.php .
COPY index.php .
COPY .htaccess .
COPY start-apache.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/start-apache.sh

# Permissions
RUN chown -R www-data:www-data /var/www/html \
    && chmod -R 755 /var/www/html

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/api.php/health || exit 1

# Installation Arduino-CLI via curl direct
RUN curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh && \
    mv /var/www/html/bin/arduino-cli /usr/local/bin/ && \
    chmod +x /usr/local/bin/arduino-cli && \
    ln -sf /usr/local/bin/arduino-cli /bin/arduino-cli

# Installation du core ESP32 pour éviter les timeouts
RUN arduino-cli core install esp32:esp32@2.0.14 && \
    arduino-cli lib install "ArduinoJson"

# Port exposé - supporte PORT environment variable pour Render
EXPOSE ${PORT:-80}

# Commande de démarrage - utilise le script pour configurer le port dynamiquement
CMD ["/usr/local/bin/start-apache.sh"]
