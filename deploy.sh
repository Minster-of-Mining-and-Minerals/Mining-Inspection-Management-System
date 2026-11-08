#!/usr/bin/env bash
# Mining Inspection Management System — deploy / update / backup on the server.
#
#   ./deploy.sh            first deployment or update: settings, checks, build, start, verify
#   ./deploy.sh update     git pull, then the same as above
#   ./deploy.sh status     containers and health
#   ./deploy.sh logs       follow the logs (Ctrl+C to stop watching)
#   ./deploy.sh backup     database dump + inspection files into ./backups/
#   ./deploy.sh stop       stop everything (data is kept)
#
# Ports: frontend 3001, backend 4001, socket 5001 (inside Docker), users on 80/443 via nginx.
set -euo pipefail
cd "$(dirname "$0")"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✔${NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }
fail() { echo -e "${RED}✘${NC} $*" >&2; exit 1; }
step() { echo; echo -e "${GREEN}==>${NC} $*"; }

COMPOSE="docker compose"
VOLUME="mims_postgres_data"

random() { openssl rand -base64 48 2>/dev/null | tr -dc 'A-Za-z0-9' | head -c "${1:-48}" || head -c 64 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c "${1:-48}"; }
getenv() { grep -E "^$2=" "$1" 2>/dev/null | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//'; }
setenv() { # file key value  (replace or add)
  if grep -qE "^$2=" "$1"; then sed -i "s|^$2=.*|$2=$3|" "$1"; else echo "$2=$3" >> "$1"; fi
}

# ---------------------------------------------------------------------------------------------
settings() {
  step "Settings"
  # Root .env (for docker compose)
  if [ ! -f .env ]; then
    cp .env.example .env
    if docker volume inspect "$VOLUME" >/dev/null 2>&1; then
      # The database already exists: keep the password it was created with
      setenv .env DB_PASSWORD "mims@mom.gov.et"
      warn ".env created. A database already exists, so DB_PASSWORD was set to the old default; change it in .env if yours differs."
    else
      setenv .env DB_PASSWORD "$(random 32)"
      ok ".env created with a new random database password."
    fi
  else
    ok ".env found."
  fi
  DOMAIN="$(getenv .env DOMAIN)"; DOMAIN="${DOMAIN:-inspection.mom.gov.et}"

  # backend/.env
  if [ ! -f backend/.env ]; then
    cp backend/.env.example backend/.env
    setenv backend/.env JWT_SECRET "$(random 64)"
    setenv backend/.env FRONTEND_URL "https://$DOMAIN"
    setenv backend/.env BASE_URL "https://$DOMAIN/api"
    ok "backend/.env created (new JWT secret)."
    warn "Email for password resets is not set up yet: EMAIL_USER / EMAIL_PASS in backend/.env."
  else
    ok "backend/.env found."
  fi
  if grep -qE '^SEED_DEV_PASSWORDS=true' backend/.env; then
    fail "backend/.env has SEED_DEV_PASSWORDS=true (test accounts with the password \"password\"). Remove it on a server."
  fi

  # frontend/.env
  if [ ! -f frontend/.env ]; then
    cp frontend/.env.example frontend/.env
    secret="$(random 48)"
    setenv frontend/.env NEXTAUTH_SECRET "$secret"
    setenv frontend/.env AUTH_SECRET "$secret"
    setenv frontend/.env NEXTAUTH_URL "https://$DOMAIN"
    ok "frontend/.env created (new login secret)."
  else
    ok "frontend/.env found."
  fi

  mkdir -p backend/storage backend/uploads backend/logs certbot/conf certbot/www backups
}

checks() {
  step "Checks"
  command -v docker >/dev/null || fail "Docker is not installed."
  docker info >/dev/null 2>&1 || fail "Docker is not running (or this user may not use it: try sudo, or add the user to the docker group)."
  $COMPOSE version >/dev/null 2>&1 || fail "Docker Compose (docker compose) is not available."
  ok "Docker and Docker Compose."

  # DNS
  if command -v getent >/dev/null; then
    ip="$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || true)"
    if [ -n "$ip" ]; then ok "$DOMAIN resolves to $ip."; else warn "$DOMAIN does not resolve yet: the HTTPS certificate will fail until DNS points to this server."; fi
  fi

  # Ports 80 / 443 must be free unless our own nginx has them
  for port in 80 443; do
    if command -v ss >/dev/null && ss -tln 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$port\$"; then
      if docker ps --format '{{.Names}} {{.Ports}}' | grep -q "mims_nginx.*:$port->"; then
        ok "Port $port is used by mims_nginx (fine)."
      else
        fail "Port $port is already used by another program. Stop it first (sudo ss -tlnp | grep :$port)."
      fi
    else
      ok "Port $port is free."
    fi
  done
}

start() {
  step "Building and starting (the first build takes several minutes)"
  $COMPOSE up -d --build
  ok "Containers started."
}

verify() {
  step "Waiting for the backend (database migrations and base data run on start)"
  for i in $(seq 1 90); do
    if curl -fsS http://127.0.0.1:4001/ >/dev/null 2>&1; then ok "Backend answers on port 4001."; break; fi
    if [ "$i" -eq 90 ]; then
      $COMPOSE logs --tail=40 backend
      fail "The backend did not start in 3 minutes (logs above)."
    fi
    sleep 2
  done
  for i in $(seq 1 60); do
    if curl -fsS -o /dev/null http://127.0.0.1:3001/ 2>/dev/null || curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/ 2>/dev/null | grep -qE '^(2|3)'; then ok "Frontend answers on port 3001."; break; fi
    if [ "$i" -eq 60 ]; then warn "The frontend did not answer yet: docker compose logs frontend"; fi
    sleep 2
  done

  step "HTTPS certificate"
  if [ -f "certbot/conf/live/$DOMAIN/fullchain.pem" ]; then
    ok "Certificate present; nginx serves HTTPS."
  else
    echo "Requesting it from Let's Encrypt (about a minute)..."
    for i in $(seq 1 45); do
      [ -f "certbot/conf/live/$DOMAIN/fullchain.pem" ] && break
      sleep 4
    done
    if [ -f "certbot/conf/live/$DOMAIN/fullchain.pem" ]; then ok "Certificate issued; nginx switches to HTTPS."; else
      warn "No certificate yet. Check DNS and that port 80 is open from the internet, then: docker compose logs certbot"
    fi
  fi

  step "Done"
  $COMPOSE ps
  echo
  echo "Open:  https://$DOMAIN"
  echo "First login: admin@gmail.com / password  →  change the password at once (Profile)."
  echo "Then add the inspectors under Users and create the Schedules."
}

backup() {
  step "Backup"
  mkdir -p backups
  stamp="$(date +%Y-%m-%d_%H%M)"
  user="$(getenv .env DB_USER)"; user="${user:-mims_user}"
  db="$(getenv .env DB_NAME)"; db="${db:-mims_db}"
  $COMPOSE exec -T postgres pg_dump -U "$user" "$db" | gzip > "backups/db_$stamp.sql.gz"
  ok "Database: backups/db_$stamp.sql.gz"
  tar -czf "backups/files_$stamp.tar.gz" backend/storage backend/uploads 2>/dev/null
  ok "Inspection files: backups/files_$stamp.tar.gz"
  echo "Copy the backups folder off the server regularly."
}

# ---------------------------------------------------------------------------------------------
case "${1:-deploy}" in
  deploy) settings; checks; start; verify ;;
  update)
    step "Getting the latest code"
    git pull --ff-only
    settings; checks; start; verify ;;
  status) $COMPOSE ps; curl -fsS http://127.0.0.1:4001/ >/dev/null && ok "Backend healthy." || warn "Backend not answering." ;;
  logs) $COMPOSE logs -f --tail=100 ;;
  backup) backup ;;
  stop) $COMPOSE down; ok "Stopped (data kept)." ;;
  *) echo "Usage: ./deploy.sh [deploy|update|status|logs|backup|stop]"; exit 1 ;;
esac
