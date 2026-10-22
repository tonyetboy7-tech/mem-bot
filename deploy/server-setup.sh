#!/usr/bin/env bash
# mem's server setup. Run ONCE on a fresh Ubuntu 24.04 server as root:
#   bash <(curl -fsSL https://raw.githubusercontent.com/YOU/mem-bot/main/deploy/server-setup.sh) https://github.com/YOU/mem-bot [bot.yourdomain.com]
# It installs Node + Caddy, downloads mem's code, asks for mem's secrets (typed, never uploaded anywhere),
# starts mem as a service that restarts on its own, and serves the feed over HTTPS.
set -euo pipefail

REPO_URL="${1:-}"
HOST="${2:-}"
if [ -z "$REPO_URL" ]; then echo "usage: bash server-setup.sh https://github.com/YOU/mem-bot [bot.yourdomain.com]"; exit 1; fi
if [ "$(id -u)" != "0" ]; then echo "run this as root"; exit 1; fi

echo "== 1/6 installing basics"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git ufw gnupg debian-keyring debian-archive-keyring apt-transport-https

echo "== 2/6 installing Node.js 22"
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo "== 3/6 installing Caddy (gives the feed an HTTPS address)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

echo "== 4/6 downloading mem's code"
id mem >/dev/null 2>&1 || useradd -r -m -d /opt/mem -s /usr/sbin/nologin mem
mkdir -p /opt/mem/data
if [ -d /opt/mem/bot/.git ]; then git -C /opt/mem/bot pull; else git clone "$REPO_URL" /opt/mem/bot; fi
cd /opt/mem/bot
npm install --no-audit --no-fund

echo "== 5/6 mem's secrets (stay on this server only)"
if [ ! -f /opt/mem/bot/.env ]; then
  read -rsp "Paste mem's PRIVATE KEY (it stays hidden as you paste), then press Enter: " PK; echo
  read -rp "Paste your Helius RPC URL (https://mainnet.helius-rpc.com/?api-key=...): " RPC
  read -rp "Paste your Jupiter API key: " JUP
  read -rp "Wallets that never get drops, comma separated (dev/team), or leave blank: " EXC
  umask 077
  {
    echo "DRY_RUN=true"
    echo "PRIVATE_KEY=$PK"
    echo "MEM_MINT="
    echo "RPC_URL=$RPC"
    echo "JUPITER_API_KEY=$JUP"
    echo "EXCLUDE_WALLETS=$EXC"
    echo "DATA_DIR=/opt/mem/data"
    echo "PORT=8787"
  } > /opt/mem/bot/.env
  unset PK
fi
chown -R mem:mem /opt/mem
chmod 600 /opt/mem/bot/.env

cat > /etc/systemd/system/mem.service <<'UNIT'
[Unit]
Description=mem shopping bot
After=network-online.target
Wants=network-online.target

[Service]
User=mem
WorkingDirectory=/opt/mem/bot
ExecStart=/opt/mem/bot/node_modules/.bin/tsx src/index.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now mem
systemctl restart mem

echo "== 6/6 HTTPS address + firewall"
if [ -z "$HOST" ]; then
  IP="$(curl -fsS https://api.ipify.org)"
  HOST="${IP//./-}.nip.io"
fi
cat > /etc/caddy/Caddyfile <<CADDY
$HOST {
  reverse_proxy localhost:8787
}
CADDY
systemctl reload caddy || systemctl restart caddy
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

echo
echo "================================================================"
echo " mem is running (practice mode: DRY_RUN=true)."
echo " mem's feed:  https://$HOST/feed.json   (can take a minute the first time)"
echo " watch mem:   journalctl -u mem -f        (Ctrl+C to stop watching)"
echo " settings:    nano /opt/mem/bot/.env   then   systemctl restart mem"
echo "================================================================"
