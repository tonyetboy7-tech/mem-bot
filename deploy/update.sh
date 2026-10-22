#!/usr/bin/env bash
# pull mem's latest code from GitHub and restart him. Run as root: bash /opt/mem/bot/deploy/update.sh
set -euo pipefail
cd /opt/mem/bot
sudo -u mem git pull || git pull
npm install --no-audit --no-fund
chown -R mem:mem /opt/mem
systemctl restart mem
echo "mem updated and restarted. watch him: journalctl -u mem -f"
