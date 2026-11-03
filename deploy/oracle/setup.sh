#!/usr/bin/env bash
# One time setup for n8n on an Oracle Cloud Ubuntu VM (Ampere A1 / ARM).
# Run from this folder:   bash setup.sh
# Safe to run again: it keeps your existing .env and data.
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }

# 1. Open ports 80 and 443 in the VM's own firewall. Oracle's Ubuntu images
#    block everything except SSH by default. This must happen before Docker
#    is installed, so the saved rules don't include Docker's own rules.
say "Opening ports 80 and 443 in the VM firewall"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent curl
for port in 80 443; do
  sudo iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null \
    || sudo iptables -I INPUT 1 -p tcp --dport "$port" -m state --state NEW -j ACCEPT
done
if ! command -v docker >/dev/null; then
  sudo netfilter-persistent save
fi

# 2. Docker
if ! command -v docker >/dev/null; then
  say "Installing Docker"
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo usermod -aG docker "$USER" || true

# 3. Settings (.env): domain from the public IP, and a new encryption key
if [ ! -f .env ]; then
  say "Creating .env"
  cp .env.example .env
fi
if ! grep -q '^N8N_DOMAIN=..*' .env; then
  ip="$(curl -fsS https://ifconfig.me || curl -fsS https://api.ipify.org)"
  domain="${ip//./-}.sslip.io"
  sed -i "s|^N8N_DOMAIN=.*|N8N_DOMAIN=${domain}|" .env
fi
if ! grep -q '^N8N_ENCRYPTION_KEY=..*' .env; then
  key="$(openssl rand -hex 32)"
  sed -i "s|^N8N_ENCRYPTION_KEY=.*|N8N_ENCRYPTION_KEY=${key}|" .env
fi
chmod 600 .env

# 4. Start
say "Starting n8n and Caddy (first start downloads images, about 2 minutes)"
sudo docker compose up -d

domain="$(grep '^N8N_DOMAIN=' .env | cut -d= -f2)"
key="$(grep '^N8N_ENCRYPTION_KEY=' .env | cut -d= -f2)"
cat <<MSG

Done. In 1 to 2 minutes, open:   https://${domain}

Save these two lines somewhere safe (password manager or a private note):
  N8N_DOMAIN=${domain}
  N8N_ENCRYPTION_KEY=${key}

Website setting (.env.local and Vercel):
  N8N_CHAT_WEBHOOK_URL=https://${domain}/webhook/lamig-chat

Logs:  sudo docker compose logs -f n8n     (Ctrl+C to stop watching)
MSG
