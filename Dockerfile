# ================================================================
# OTT API - Dockerfile Production
# ================================================================
# Image PHP 8.2 avec Apache pour l'API backend
# Optimisé pour Render.com et environnements cloud
# ================================================================

FROM php:8.2-apache AS base

# Métadonnées
LABEL maintainer="HAPPLYZ MEDICAL <support@happlyz.com>"
LABEL version="3.1.0"
LABEL description="OTT API Backend - Dispositif Médical IoT"

# Variables d'environnement validées une seule fois
ENV APACHE_DOCUMENT_ROOT=/var/www/html \
    PHP_MEMORY_LIMIT=512M \
    PHP_MAX_EXECUTION_TIME=120 \
    PHP_UPLOAD_MAX_FILESIZE=100M \
    PHP_POST_MAX_SIZE=100M \
    PORT=80 \
    APP_ENV=production

# Dépendances système
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
    && rm -rf /var/lib/apt/lists/*

# Extensions PHP
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

# VirtualHost Apache
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

# Configuration PHP personnalisée
RUN echo "memory_limit = ${PHP_MEMORY_LIMIT}" > /usr/local/etc/php/conf.d/custom.ini \
    && echo "max_execution_time = ${PHP_MAX_EXECUTION_TIME}" >> /usr/local/etc/php/conf.d/custom.ini \
    && echo "upload_max_filesize = ${PHP_UPLOAD_MAX_FILESIZE}" >> /usr/local/etc/php/conf.d/custom.ini \
    && echo "post_max_size = ${PHP_POST_MAX_SIZE}" >> /usr/local/etc/php/conf.d/custom.ini \
    && echo "display_errors = Off" >> /usr/local/etc/php/conf.d/custom.ini \
    && echo "log_errors = On" >> /usr/local/etc/php/conf.d/custom.ini

# OPcache en production
RUN echo "opcache.enable=1" > /usr/local/etc/php/conf.d/opcache.ini \
    && echo "opcache.memory_consumption=128" >> /usr/local/etc/php/conf.d/opcache.ini \
    && echo "opcache.interned_strings_buffer=8" >> /usr/local/etc/php/conf.d/opcache.ini \
    && echo "opcache.max_accelerated_files=4000" >> /usr/local/etc/php/conf.d/opcache.ini \
    && echo "opcache.validate_timestamps=0" >> /usr/local/etc/php/conf.d/opcache.ini \
    && echo "opcache.revalidate_freq=2" >> /usr/local/etc/php/conf.d/opcache.ini

# Installation Arduino CLI avant la copie de l'application
RUN curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | BINDIR=/usr/local/bin sh && \
    arduino-cli core update-index && \
    arduino-cli core install esp32:esp32@2.0.14 && \
    arduino-cli lib install "ArduinoJson" "TinyGSM" "ArduinoHttpClient" && \
    mkdir -p /var/www/html/hardware/arduino-data/{libraries,hardware} && \
    pip3 install pyserial --break-system-packages

FROM base AS production

# Stage final avec application et scripts
WORKDIR /var/www/html

# Copier l'application et le script tout en conservant l'utilisateur www-data
COPY --chown=www-data:www-data . /var/www/html/
COPY start-apache.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/start-apache.sh \
    && chown -R www-data:www-data /var/www/html \
    && chmod -R 755 /var/www/html

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/api.php/health || exit 1

# Port exposé (compatible Render)
EXPOSE ${PORT:-80}

# Commande de démarrage directe Apache
CMD ["apache2-foreground"]
