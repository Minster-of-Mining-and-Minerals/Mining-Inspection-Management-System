# Deployment Guide

This guide walks through deploying the application to production using Let's Encrypt for automatic HTTPS.

## Prerequisites

### 1. DNS Configuration
Before starting the deployment, ensure your DNS A record points to the public IP address of your server.
You can verify this by running:
```bash
nslookup inspection.mom.gov.et
# OR
dig inspection.mom.gov.et
```
The output should return your server's public IP address. **Do not proceed** until DNS has propagated, as Let's Encrypt will fail to validate the domain.

### 2. Firewall / Ports
Ensure the following inbound ports are open and accessible from the public internet:
- **Port 80 (HTTP)**: Required for initial Let's Encrypt validation (HTTP-01 challenge) and HTTP -> HTTPS redirects.
- **Port 443 (HTTPS)**: Required for secure application traffic.

You can verify port 80 is open from an external machine:
```bash
curl -I http://inspection.mom.gov.et
```

---

## Initial Deployment

### 1. Build and Start Services
We first start the application in a special "Bootstrap Mode". Nginx will temporarily serve traffic over HTTP (port 80) only, so that Certbot can complete the domain validation.

```bash
docker compose build
docker compose up -d postgres backend frontend nginx certbot
```

### 2. Request the First Let's Encrypt Certificate
Run the initialization script. This will use Certbot to request a certificate via the webroot method and store it in Docker volumes (`./certbot/conf`).

```bash
./init-letsencrypt.sh
```

### 3. Verify
Once `./init-letsencrypt.sh` finishes, it will automatically restart Nginx. Nginx will detect the new certificates and switch to "Production Mode" (serving HTTPS on port 443).

Navigate to `https://inspection.mom.gov.et` in your browser. The site should load securely with a valid Let's Encrypt certificate.

---

## Automatic Renewal

The `certbot` container runs a background loop that checks for expiring certificates every 12 hours.
```bash
while :; do
  certbot renew --deploy-hook "docker exec mims_nginx nginx -s reload"
  sleep 12h
done
```
When a certificate is renewed, Certbot automatically signals the `nginx` container to reload its configuration.

### Verifying Renewal
You can check the logs of the certbot container to ensure the renewal loop is running:
```bash
docker compose logs certbot -f
```

To perform a dry run of the renewal process, execute:
```bash
docker compose exec certbot certbot renew --dry-run
```
