#!/usr/bin/env bash
# One-time Hostinger VPS bootstrap for KikooAI backend.
# Run as root on the VPS (Hostinger web terminal or SSH):
#   curl -fsSL https://raw.githubusercontent.com/Zyntrix-company/Kikooai-backend/main/deploy/setup-server.sh | bash
# Or copy this repo and: bash deploy/setup-server.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/kikooai-backend}"
REPO_URL="${REPO_URL:-https://github.com/Zyntrix-company/Kikooai-backend.git}"
BRANCH="${BRANCH:-main}"
NODE_MAJOR="${NODE_MAJOR:-20}"

echo "==> KikooAI backend VPS setup"
echo "    APP_DIR=$APP_DIR"

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git nginx ufw ca-certificates build-essential

# Node.js ${NODE_MAJOR}.x (NodeSource)
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != v${NODE_MAJOR}* ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi

npm install -g pm2

mkdir -p /var/log/kikooai
chmod 755 /var/log/kikooai

if [ ! -d "$APP_DIR/.git" ]; then
  echo "==> Cloning repository into $APP_DIR"
  git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$APP_DIR"
else
  echo "==> Repository already exists at $APP_DIR"
fi

cd "$APP_DIR"

if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "!! Created $APP_DIR/.env from .env.example"
  echo "!! Edit it with production values before starting:"
  echo "   nano $APP_DIR/.env"
  echo ""
fi

export NODE_ENV=production
npm ci --omit=dev
npm run migrate

pm2 start ecosystem.config.cjs --env production || pm2 reload ecosystem.config.cjs --env production --update-env
pm2 save
env PATH="$PATH:/usr/bin" pm2 startup systemd -u root --hp /root | tail -1 | bash || true

# Nginx reverse proxy
NGINX_SITE="/etc/nginx/sites-available/kikooai-backend"
cat > "$NGINX_SITE" <<'NGINX'
server {
    listen 8080;
    server_name _;

    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
NGINX

ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/kikooai-backend
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
nginx -t
systemctl enable nginx
systemctl reload nginx

# Firewall
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw allow 8080/tcp
ufw --force enable

echo ""
echo "==> Setup complete."
echo "    1. Edit $APP_DIR/.env (DATABASE_URL, JWT_SECRET, Cloudinary, Gemini, etc.)"
echo "    2. pm2 reload ecosystem.config.cjs --env production"
echo "    3. Set PORT=3001 in .env if port 3000 is already used, then: curl http://127.0.0.1:8080/healthz"
echo "    4. Optional TLS: certbot --nginx -d your.domain.com"
echo "    5. Add GitHub Actions secrets (see deploy/DEPLOY.md)"
