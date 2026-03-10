#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

cp web/config.js ~/web.config.js.backup
git fetch origin
git reset --hard origin/nip17
git clean -fd
cp ~/web.config.js.backup web/config.js
docker compose -f docker-compose.prod.yml up -d --build --remove-orphans

echo "Done: updated to origin/nip17, restored web/config.js, and redeployed containers."