#!/bin/bash
# Startup script for Render deployment
# Configure Apache to listen on the PORT environment variable

# Set default port if not specified
PORT=${PORT:-10000}

# Update Apache ports.conf to listen on the correct port
sed -i "s/Listen 80/Listen $PORT/" /etc/apache2/ports.conf

# Update the VirtualHost configuration
sed -i "s/*:80/*:$PORT/" /etc/apache2/sites-available/000-default.conf

# Start Apache in foreground
exec apache2-foreground
