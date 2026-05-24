#!/usr/bin/env bash
# HTTPS without a custom domain — uses sslip.io (DNS for your VPS IP).
# Run on the VPS as root after setup-server.sh:
#   bash deploy/setup-https.sh
set -euo pipefail

VPS_IP="${VPS_IP:-$(curl -fsS https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')}"
SSLIP_HOST="${SSLIP_HOST:-$(echo "$VPS_IP" | tr '.' '-')}.sslip.io"
BACKEND_PORT="${BACKEND_PORT:-3001}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-admin@kikoo.ai}"
APP_DIR="${APP_DIR:-/opt/kikooai-backend}"

echo "==> HTTPS via $SSLIP_HOST -> $VPS_IP"

apt-get install -y certbot 2>/dev/null || true
mkdir -p /var/www/certbot

NGINX_HTTP="/etc/nginx/sites-available/kikooai-backend"
cat > "$NGINX_HTTP" <<NGINX
server {
    listen 80;
    server_name ${SSLIP_HOST} ${VPS_IP};

    client_max_body_size 25m;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }
}
NGINX

ln -sf "$NGINX_HTTP" /etc/nginx/sites-enabled/kikooai-backend
nginx -t && systemctl reload nginx

if [ ! -f "/etc/letsencrypt/live/${SSLIP_HOST}/fullchain.pem" ]; then
  certbot certonly --webroot -w /var/www/certbot \
    -d "$SSLIP_HOST" --non-interactive --agree-tos -m "$CERTBOT_EMAIL"
fi

cat > "$NGINX_HTTP" <<NGINX
server {
    listen 80;
    server_name ${SSLIP_HOST} ${VPS_IP};
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl;
    http2 on;
    server_name ${SSLIP_HOST} ${VPS_IP};

    ssl_certificate /etc/letsencrypt/live/${SSLIP_HOST}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${SSLIP_HOST}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }
}
NGINX

nginx -t && systemctl reload nginx
ufw allow 80/tcp 2>/dev/null || true
ufw allow 443/tcp 2>/dev/null || true

# Optional: set public API URL for contest share links, etc.
if [ -f "$APP_DIR/.env" ]; then
  if grep -q '^APP_BASE_URL=' "$APP_DIR/.env"; then
    sed -i "s|^APP_BASE_URL=.*|APP_BASE_URL=https://${SSLIP_HOST}|" "$APP_DIR/.env"
  else
    echo "APP_BASE_URL=https://${SSLIP_HOST}" >> "$APP_DIR/.env"
  fi
  cd "$APP_DIR" && pm2 reload ecosystem.config.cjs --env production --update-env 2>/dev/null || true
fi

echo ""
echo "HTTPS API: https://${SSLIP_HOST}/api/v1"
echo "Health:    https://${SSLIP_HOST}/healthz"
echo "Cert renews automatically via certbot timer."
