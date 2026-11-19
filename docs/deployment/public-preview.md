# Protected public preview

The owner authorized deployment to `robotics-infra` with a shared login. The host already serves other applications. Add only `/blockcalc` to the existing public HTTPS listener; preserve every existing handler and the privacy of other ports. This preview supports the customer checks in #16, which remain open.

## Build and configure

Use the reviewed commit and the [release procedure](release.md). Build the frontend with `VITE_BASE_PATH=/blockcalc/` and use the same release tag for both images:

```sh
docker build -t blockcalc-backend:<commit> backend
docker build --build-arg VITE_BASE_PATH=/blockcalc/ -t blockcalc-frontend:<commit> frontend
```

Generate a random shared password locally. Feed it to `openssl passwd -6 -stdin`; do not put it in shell history, process arguments, Git, or logs. Write a single `username:hash` line to an external htpasswd file. Keep its parent directory mode `0700`; the mounted file must be readable by frontend UID 101 (mode `0644` inside that protected directory). The server needs only the hash. Deliver the plaintext login to the owner separately.

Copy `deploy/.env.public.example` to a private installation environment file and replace its placeholders. Link that file as `deploy/.env` in the release checkout. Use a stable `BLOCKCALC_PROJECT_NAME` so upgrades keep the same data and backups. Keep `COMPOSE_FILE=compose.yaml:compose.public.yaml` in that environment: backup, restore, and update commands must retain the public profile.

```sh
cd <deployment-root>/current/deploy
docker compose config --quiet
docker compose up -d --no-build --wait --wait-timeout 120
python3 smoke.py http://127.0.0.1:18096/blockcalc/ --credentials-file /private/login.json
```

The smoke file contains `{"username":"...","password":"..."}` and must have mode `0600`. It is an operator verification input, never a web asset or release artifact. The smoke check is read-only apart from a stateless invalid-calculation request. It checks anonymous rejection as well as authorized routes and contract parity.

NGINX requires HTTP Basic login for the UI, assets, API, and docs. Only `/health` is anonymous and contains status/schema version. The public profile expects HTTPS to terminate at Funnel and sets the trusted forwarded scheme accordingly. Uvicorn receives `--root-path /blockcalc` so generated docs use the correct prefix. Forwarded headers are trusted only inside the isolated Docker network; the backend has no published port. See [FastAPI proxy guidance](https://fastapi.tiangolo.com/advanced/behind-a-proxy/).

## Preserve data and publish

Follow the selected-snapshot cutover in [release.md](release.md). Stop the old backend before allowing writes on the new installation. Compare all seven business tables after restore. Keep the old installation, snapshot, and image IDs for rollback. Never import QA fixtures into the installation.

Save `tailscale serve status --json` and the existing crontab in the private deployment directory. Verify the authorized and anonymous localhost checks before enabling the public route. On a host whose existing public listener is HTTPS port 10000:

```sh
sudo tailscale funnel --bg --yes --https=10000 --set-path=/blockcalc http://127.0.0.1:18096
```

Use `https://<host>.<tailnet>.ts.net:10000/blockcalc/`. Confirm external TLS, anonymous 401 responses for the UI/API/docs, successful shared login, assets, deep-link reloads, and the live OpenAPI contract. Compare the saved Serve configuration: the only addition should be this handler. Do not reset Serve/Funnel or change the visibility of existing listeners. Funnel supports only specific HTTPS ports, and its background configuration persists across restart; see the [Funnel CLI reference](https://tailscale.com/docs/reference/tailscale-cli/funnel).

Move only the BlockCalc backup cron entry to `<deployment-root>/current/deploy/backup.sh`, preserve unrelated jobs, and verify a fresh backup. The existing 03:00 Europe/Moscow staging schedule remains provisional until the customer confirms the operational agreement. Retain snapshots without automatic deletion while retention is pending.

## Restore, rotate, or withdraw

Run backup and restore helpers from the public installation with its `.env` intact:

```sh
cd <deployment-root>/current/deploy
./backup.sh
./restore.sh /private/selected.sqlite3
python3 smoke.py http://127.0.0.1:18096/blockcalc/ --credentials-file /private/login.json
```

Restore removes its temporary uploaded copy on success and failure; intentional backups and the selected source remain. An invalid restore leaves the backend stopped and the previous database intact. The public login remains configured throughout recovery.

To rotate the shared password, generate a replacement hash without printing the password, replace the external htpasswd file, then recreate only `frontend` with `docker compose up -d --no-build --force-recreate --wait frontend`. Recheck old-login rejection and new-login success. Recreating refreshes the bind mount after atomic file replacement.

To withdraw this preview, remove only its handler using `sudo tailscale funnel --https=10000 --set-path=/blockcalc off`. Verify other handlers are unchanged. Keep data volumes and snapshots. Application rollback follows [release.md](release.md); do not restart the old database for writes until newer records have been preserved and the rollback snapshot is selected explicitly.
