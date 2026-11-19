#!/bin/sh
# Restore a selected snapshot into this installation; stop its backend first.
set -eu
if [ "$#" -ne 1 ] || [ ! -f "$1" ]; then
    echo "Usage: $0 /absolute/path/to/selected.sqlite3" >&2
    exit 2
fi
snapshot=$(realpath "$1")
cd -- "$(dirname "$0")"
docker compose stop backend
docker compose run --rm --no-deps -T backend python -c '
import sys
from pathlib import Path
from blockcalc.backup import copy_database
source = Path("/backups/selected-restore.sqlite3")
source.write_bytes(sys.stdin.buffer.read())
copy_database(source, Path("/data/blockcalc.sqlite3"), upgrade=True)
print("Selected backup restored and verified")
' < "$snapshot"
docker compose up -d --no-build --wait --wait-timeout 120
