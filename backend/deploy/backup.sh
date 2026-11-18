#!/bin/sh
set -eu
cd -- "$(dirname "$0")/.."
stamp=$(date -u +%Y%m%dT%H%M%SZ)
docker compose exec -T backend python -m blockcalc.backup backup --output "/backups/blockcalc-$stamp.sqlite3"
