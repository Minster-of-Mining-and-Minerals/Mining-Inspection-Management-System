#!/bin/sh
set -e

DOMAIN="${DOMAIN:-inspection.mom.gov.et}"
EMAIL="${EMAIL:-admin@inspection.mom.gov.et}"
DATA_PATH="/etc/letsencrypt"
RSA_KEY_SIZE=4096

# Wait for nginx to be available on port 80
echo "[certbot] Waiting for Nginx to be ready on HTTP (sleeping 10s)..."
sleep 10
echo "[certbot] Nginx should be ready!"

if [ ! -f "$DATA_PATH/live/$DOMAIN/fullchain.pem" ]; then
  echo "[certbot] ================================================"
  echo "[certbot] Certificates not found for $DOMAIN."
  echo "[certbot] Requesting initial certificate..."
  echo "[certbot] ================================================"
  
  certbot certonly --webroot -w /var/www/certbot \
    --email "$EMAIL" \
    -d "$DOMAIN" \
    --rsa-key-size $RSA_KEY_SIZE \
    --agree-tos \
    --no-eff-email \
    --non-interactive
    
  echo "[certbot] ================================================"
  echo "[certbot] Initial certificate requested successfully."
  echo "[certbot] Nginx will detect the certificate and switch to HTTPS automatically."
  echo "[certbot] ================================================"
else
  echo "[certbot] Certificates found for $DOMAIN."
fi

# Start the renewal loop
echo "[certbot] Starting auto-renewal loop (checks every 12 hours)..."
trap exit TERM
while :; do
  certbot renew || echo "[certbot] Renewal attempt failed. Will retry later."
  sleep 12h &
  wait $!
done
