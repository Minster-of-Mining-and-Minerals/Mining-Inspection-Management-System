#!/bin/sh
set -e

DOMAIN="${DOMAIN:-inspection.mom.gov.et}"
CERT="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
KEY="/etc/letsencrypt/live/${DOMAIN}/privkey.pem"

echo "[nginx] Starting entrypoint for domain: ${DOMAIN}"

# Make DOMAIN available for envsubst
export DOMAIN

# ── Select initial config based on cert existence ──────────────────────────────
if [ ! -f "$CERT" ] || [ ! -f "$KEY" ]; then
    echo "[nginx] No SSL certificate found."
    echo "[nginx] Starting in HTTP-only bootstrap mode for initial certificate issuance..."
    envsubst '${DOMAIN}' < /etc/nginx/templates/nginx.conf.bootstrap > /etc/nginx/conf.d/default.conf
else
    echo "[nginx] SSL certificate found. Starting in HTTPS production mode..."
    envsubst '${DOMAIN}' < /etc/nginx/templates/nginx.conf.production > /etc/nginx/conf.d/default.conf
fi

echo "[nginx] Testing configuration..."
nginx -t

# ── Start nginx in the background ─────────────────────────────────────────────
nginx -g "daemon off;" &
NGINX_PID=$!

# ── If HTTP-only mode: wait for cert, then switch to HTTPS ────────────────────
if [ ! -f "$CERT" ] || [ ! -f "$KEY" ]; then
    echo "[nginx] Waiting for Certbot to issue SSL certificate..."
    while [ ! -f "$CERT" ] || [ ! -f "$KEY" ]; do
        sleep 5
    done
    echo "[nginx] Certificate obtained! Switching to HTTPS production mode..."
    sleep 2  # allow certbot to finish writing all cert files
    envsubst '${DOMAIN}' < /etc/nginx/templates/nginx.conf.production > /etc/nginx/conf.d/default.conf
    nginx -s reload
    echo "[nginx] Now running in HTTPS mode."
fi

# ── Reload every 12 hours to pick up renewed certificates ──────────────────────
while kill -0 "$NGINX_PID" 2>/dev/null; do
    sleep 12h &
    wait $!
    echo "[nginx] Reloading to pick up any renewed SSL certificates..."
    nginx -s reload
done
