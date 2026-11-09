# Deployment guide — Pathshala ERP

This guide takes a fresh Linux server to a running production install with PostgreSQL, HTTPS and automatic startup.

---

## 1. Requirements

- Ubuntu 22.04+ / Debian 12+ (any modern Linux)
- Node.js **20 LTS or newer** (26.x is tested)
- PostgreSQL **14+**
- Nginx (or Caddy) for reverse proxy
- A domain name with DNS pointing at the server (for TLS)

---

## 2. Install prerequisites

```bash
sudo apt update
sudo apt install -y curl git nginx postgresql postgresql-contrib

# Node.js 20+ (via NodeSource, or use nvm)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v    # >= 20
```

---

## 3. Create the database

```bash
sudo -u postgres psql <<'SQL'
CREATE USER pathshala WITH PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
CREATE DATABASE pathshala_erp OWNER pathshala;
GRANT ALL PRIVILEGES ON DATABASE pathshala_erp TO pathshala;
SQL
```

---

## 4. Fetch and build the app

```bash
sudo mkdir -p /opt/pathshala && sudo chown "$USER" /opt/pathshala
cd /opt/pathshala

# copy the project (or clone your repository)
#   server/  web/  package.json  package-lock.json

npm ci                 # or: npm install
npm run build          # builds server/dist and web/dist (PWA)
```

---

## 5. Configure the environment

Create `/opt/pathshala/server/.env` (the server loads it automatically):

```ini
NODE_ENV=production
PORT=4000

# REQUIRED in production — the server refuses to start with the dev default
JWT_SECRET=replace-with-64-random-bytes-openssl-rand-hex-64

# Production database
DB_DRIVER=postgres
DATABASE_URL=postgresql://pathshala:CHANGE_ME_STRONG_PASSWORD@localhost:5432/pathshala_erp

# Public URL of the API (used in links inside emails/SMS/receipts)
PUBLIC_URL=https://school.example.com

UPLOAD_DIR=/opt/pathshala/uploads

# Optional gateways
# SMS_API_URL=https://sms-provider.example.com/api
# SMS_API_KEY=...
# AI_API_KEY=...
# AI_API_MODEL=...
```

Generate a JWT secret:

```bash
openssl rand -hex 32
```

> The web app talks to the API through the same origin (`/api/v1`), so **no CORS origin is needed** in production — Nginx routes `/api`, `/uploads` and `/health` to Node and serves everything else from `web/dist`.

---

## 6. Run migrations and seed

```bash
cd /opt/pathshala
npm run db:migrate     # applies pending SQL migrations to PostgreSQL

# Optional — demo data. Skip this for a real school:
# npm run db:seed
```

Migrations also run automatically the first time the server starts, so step 6 is belt-and-braces.

---

## 7. Process manager (systemd)

Create `/etc/systemd/system/pathshala.service`:

```ini
[Unit]
Description=Pathshala ERP API
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/pathshala/server
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
EnvironmentFile=/opt/pathshala/server/.env

# hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now pathshala
sudo systemctl status pathshala
curl -s http://localhost:4000/health
```

---

## 8. Serve the web app (Nginx)

Create `/etc/nginx/sites-available/pathshala`:

```nginx
server {
    listen 80;
    server_name school.example.com;

    # upload size limit (avatars, documents, gallery)
    client_max_body_size 20m;

    # API + uploads
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
    }

    location /health {
        proxy_pass http://127.0.0.1:4000;
    }

    # Built web app (PWA)
    root /opt/pathshala/web/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # hashed assets can be cached forever
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/pathshala /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### TLS (HTTPS)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d school.example.com
```

Certbot rewrites the config and renews automatically. Set `PUBLIC_URL=https://school.example.com` to match.

---

## 9. File uploads

Uploads live in `UPLOAD_DIR` (`/opt/pathshala/uploads`). Back them up alongside the database:

```bash
# example nightly backup
0 3 * * * pg_dump -U pathshala pathshala_erp | gzip > /backup/pathshala-$(date +\%F).sql.gz
0 4 * * * tar czf /backup/uploads-$(date +\%F).tgz /opt/pathshala/uploads
```

---

## 10. Production checklist

- [ ] `NODE_ENV=production`
- [ ] `JWT_SECRET` set to a random 64-hex value (server refuses the dev default)
- [ ] `DB_DRIVER=postgres` + strong `DATABASE_URL` password
- [ ] `PUBLIC_URL` uses `https://`
- [ ] HTTPS enabled and HTTP→HTTPS redirect active
- [ ] Database + `uploads/` on a backup schedule
- [ ] `npm run typecheck` and `npm run build` pass before every release
- [ ] Demo accounts removed or passwords changed (`npm run db:seed` is for evaluation only)

---

## 11. Upgrading

```bash
cd /opt/pathshala
# pull/copy the new code
npm ci
npm run typecheck && npm run build
sudo systemctl restart pathshala
```

New migrations are applied automatically at server start.

---

## 12. Troubleshooting

| Symptom | Check |
|---|---|
| `JWT_SECRET must be set…` on start | Production env without a real secret — set it in `.env` |
| API 500s on start | `journalctl -u pathshala -n 100` — usually a wrong `DATABASE_URL` |
| Web loads but every request 404s | Nginx not proxying `/api/` — verify `proxy_pass` |
| Login fails with 401 after a while | Normal — access tokens last 15 min and refresh silently; if refresh fails, check clock skew and `REFRESH_TOKEN_TTL` |
| Uploads 413 | Raise `client_max_body_size` in Nginx |
| PWA serves stale files | Service worker auto-updates on next visit; force-reload once after deploying |
