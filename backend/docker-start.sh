#!/bin/sh
# Container start: wait for Postgres, apply migrations and base data, then run the API.
# Migrations and seeders are safe to run on every start (seeders only add what is missing).
set -e

echo "[backend] Waiting for the database at ${DB_HOST:-postgres}:${DB_PORT:-5432}..."
tries=0
until node -e "
  const { Client } = require('pg');
  const c = new Client({ host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  c.connect().then(() => c.end()).then(() => process.exit(0)).catch(() => process.exit(1));
" 2>/dev/null; do
  tries=$((tries + 1))
  if [ "$tries" -ge 60 ]; then
    echo "[backend] Database not reachable after 2 minutes." >&2
    exit 1
  fi
  sleep 2
done

echo "[backend] Applying database migrations..."
npx sequelize-cli db:migrate

echo "[backend] Adding base data (roles, permissions, locations, minerals, license list, checklist)..."
npx sequelize-cli db:seed:all

echo "[backend] Starting the API on port ${PORT:-4001}..."
exec node app.js
