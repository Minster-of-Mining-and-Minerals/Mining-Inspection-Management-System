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
  (Profile → Change password) and the email address. This is the **central administrator**. Restarts never
  reset its password (on a server, base data only adds what is missing).
- The license list creates companies, licenses and teams, **but no inspector accounts** on a server.
  Add the inspectors under **Users** (choose their team when creating them).
- Create the inspection **Schedules**; tasks appear for the teams.

### Sectors

Each sector (Ministry of Mines, GIE, MIDI …) works separately. Its users, companies, teams,
checklists, schedules, inspections and dashboard are visible only inside that sector.
Existing data belongs to **Ministry of Mines**.

- The **central administrator** sees every sector. The **Sector** filter on the dashboard, teams,
  companies, inspections, schedules, checklists, users and roles pages shows all sectors together, or
  one sector. The choice stays the same on every page until it is changed. Anything the central
  administrator creates goes into the sector chosen there (or, for users, the sector chosen in the form).
- One sector admin per sector is created on the first start, each with the password **password** to change at first login:
  - `mom-admin@gmail.com` for Ministry of Mines
  - `gie-admin@gmail.com` for GIE
  - `midi-admin@gmail.com` for MIDI

  Log in as each one (or have its owner do it) to set a real password, and change the email in Profile. Restarts never reset these accounts. For a new sector, create a user with the **sector_admin** role in that sector. A sector admin
  manages everything in their sector, but can't create sectors, change the shared locations and
  minerals, or give anyone permissions they don't have themselves. Give a sector admin the
  `sector:create` permission (or the **central_admin** role) only if they should manage sectors too.
- Roles such as supervisor and inspector are **global**: every sector uses them, and only the central
  administrator changes them. A sector admin who needs a different version uses **Copy** on the
  Roles page and changes the copy, which belongs to their sector only.
- The Plan Management System analytics API still covers the whole ministry.

### Applying a new license list

Restarts only **add** new licenses from `backend/data/license-list/`. To make existing licenses, teams, members and locations match a new list (and the coordinate list), run the update by hand. Take a database backup first (section 5):

```bash
docker compose exec backend npm run import:licenses -- --update --dry-run   # what would change; nothing saved
docker compose exec backend npm run import:licenses -- --update             # apply it
```

The report is written to `backend/reports/` in the container: `docker compose cp backend:/app/reports ./reports`. See `backend/data/license-list/README.md`.

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

## Behind another web server (ports 80/443 already used)

When another system's nginx already has ports 80/443 on the server, MIMS runs on its own port and
that nginx forwards `inspection.mom.gov.et` to it. That nginx does HTTPS (needs a certificate for
`inspection.mom.gov.et`, e.g. from its own certbot, or a `*.mom.gov.et` certificate).

1. In `.env`:
   ```env
   MIMS_MODE=behind_proxy
   HTTP_PORT=8081
   ```
2. `./deploy.sh` (MIMS answers on `http://<server-ip>:8081`; no certbot of its own).
3. In the other nginx, add (adjust the certificate paths; `10.0.71.199` = this server's IP):
   ```nginx
   server {
       listen 80;
       server_name inspection.mom.gov.et;
       location /.well-known/acme-challenge/ { root /var/www/certbot; }   # if it uses certbot webroot
       location / { return 301 https://$host$request_uri; }
   }
   server {
       listen 443 ssl;
       server_name inspection.mom.gov.et;
       ssl_certificate     /etc/letsencrypt/live/inspection.mom.gov.et/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/inspection.mom.gov.et/privkey.pem;

       client_max_body_size 100M;          # inspection photos / videos
       proxy_request_buffering off;
       proxy_read_timeout 600s;

       location / {
           proxy_pass http://10.0.71.199:8081;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto https;
           proxy_set_header X-Forwarded-Host $host;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
       }
   }
   ```
   Then reload it: `docker exec <its nginx container> nginx -t && docker exec <its nginx container> nginx -s reload`
4. Allow port 8081 only from the server itself / the internal network in the firewall: users go through HTTPS.

## Notes

- Run **one** backend container only: it also creates the scheduled inspection tasks every hour.
- Uploads are limited to 100 MB per file (nginx `client_max_body_size`); each question can set a lower limit.
- The map tiles come from OpenStreetMap over the internet.
