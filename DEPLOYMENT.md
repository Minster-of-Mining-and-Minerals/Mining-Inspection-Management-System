# Deployment — Mining Inspection Management System (MIMS)

Domain: **https://inspection.mom.gov.et** · Docker Compose · free HTTPS certificate from Let's Encrypt.

| Container | Port (inside Docker) | Reachable from |
|---|---|---|
| `mims_frontend` (Next.js) | **3001** | nginx; `127.0.0.1:3001` on the server |
| `mims_backend` (API) | **4001** | nginx; `127.0.0.1:4001` on the server |
| `mims_backend` (Socket.IO) | **5001** | `127.0.0.1:5001` on the server |
| `mims_postgres` | 5432 | Docker network only |
| `mims_nginx` | **80, 443** | the internet (users) |

Users always open `https://inspection.mom.gov.et`. HTTPS is required: browsers only give the inspector's
GPS location and the camera to `https://` pages.

## Quick start: `deploy.sh`

```bash
git clone -b inspection-system https://github.com/Minster-of-Mining-and-Minerals/Mining-Inspection-Management-System.git
cd Mining-Inspection-Management-System
chmod +x deploy.sh
./deploy.sh
```

On the first run it creates `.env`, `backend/.env` and `frontend/.env` with new random secrets and a
database password, checks Docker, DNS and ports 80/443, builds and starts everything, waits for the
backend and the HTTPS certificate, and prints the address and first login.

| Command | Does |
|---|---|
| `./deploy.sh` | deploy (also after editing settings) |
| `./deploy.sh update` | `git pull`, then deploy |
| `./deploy.sh status` | containers and health |
| `./deploy.sh logs` | follow the logs |
| `./deploy.sh backup` | database + inspection files into `./backups/` |
| `./deploy.sh stop` | stop everything (data kept) |

The sections below explain the same steps by hand.

---

## 1. Before you start

1. **DNS:** an A record `inspection.mom.gov.et` → the server's public IP.
   Check: `nslookup inspection.mom.gov.et`
2. **Firewall:** ports **80** and **443** open to the internet (80 is needed for the certificate).
   Nothing else on the server may use ports 80 / 443 (stop any other web server first).
3. **Docker** and **Docker Compose** installed.

## 2. Settings

```bash
git clone <repository-url> mims && cd mims

cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Create a `.env` file next to `docker-compose.yml` (used by Docker Compose itself):

```env
DOMAIN=inspection.mom.gov.et
EMAIL=admin@mom.gov.et          # Let's Encrypt expiry notices
DB_NAME=mims_db
DB_USER=mims_user
DB_PASSWORD=<a strong password>  # used by both the database and the backend
```

In `backend/.env` set at least: `JWT_SECRET` (long random text) and the email settings
(`EMAIL_USER`, `EMAIL_PASS`) used for password-reset emails.
In `frontend/.env` set `NEXTAUTH_SECRET` and `AUTH_SECRET` (the same long random text).

> Random text: `openssl rand -base64 48`
> Never set `SEED_DEV_PASSWORDS` on the server.

## 3. Start

```bash
docker compose up -d --build
```

What happens by itself:

- **backend** waits for the database, creates/updates the tables (migrations) and adds the base data
  (roles and permissions, regions/zones/woredas, minerals, the license list, the MoM checklist), then starts.
  This repeats safely on every start; nothing already there is changed.
- **nginx** starts on HTTP, **certbot** requests the certificate, and nginx switches to HTTPS
  (about a minute). The certificate renews automatically.

Follow it: `docker compose logs -f backend certbot nginx`

Check: open **https://inspection.mom.gov.et** · on the server, `curl http://127.0.0.1:4001/` answers.

## 4. First login

- Log in as **admin@gmail.com** with the password **password**, then **change the password at once**
  (Profile → Change password) and the email address.
- The license list creates companies, licenses and teams, **but no inspector accounts** on a server.
  Add the inspectors under **Users** (choose their team when creating them).
- Create the inspection **Schedules**; tasks appear for the teams.

## 5. Backups (important)

- Database: `docker compose exec postgres pg_dump -U mims_user mims_db > mims_$(date +%F).sql`
- Inspection photos, documents, videos and signatures: the folder **`backend/storage/`**
- Back up both regularly (e.g. daily) and keep a copy off the server.

## 6. Updating

```bash
git pull
docker compose up -d --build
```

Migrations run automatically when the backend restarts.

## 7. Useful commands

| What | Command |
|---|---|
| Logs | `docker compose logs -f backend` |
| Restart one part | `docker compose restart backend` |
| Stop everything | `docker compose down` (data stays) |
| Certificate test renewal | `docker compose exec certbot certbot renew --dry-run` |
| Database shell | `docker compose exec postgres psql -U mims_user mims_db` |

## Notes

- Run **one** backend container only: it also creates the scheduled inspection tasks every hour.
- Uploads are limited to 100 MB per file (nginx `client_max_body_size`); each question can set a lower limit.
- The map tiles come from OpenStreetMap over the internet.
