#!/bin/bash
# Startup script for Render dashboard deployment
# Configure Next.js to listen on the PORT environment variable

# Set default port if not specified
PORT=${PORT:-10000}

# Start Next.js in production with the correct port
exec npx next start -p $PORT
