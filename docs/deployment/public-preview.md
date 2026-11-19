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

The public profile also limits each client address to an average of 10 requests/second with a burst of 180. UI, assets, API, docs, and failed logins share this budget, so choosing another route cannot evade it. The burst accommodates multiple browser sessions loading the SPA together; the sustained rate remains limited. Excess requests return 429; wait a few seconds before retrying. Health probes are exempt. The private profile does not enable the limiter. See the [NGINX rate-limit module](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html).

Client identity comes from Funnel's overwritten `X-Forwarded-For` header, using its final address with `real_ip_recursive off`. The default Docker bridge range `172.16.0.0/12` is trusted only on the public server behind the loopback bind. If the host uses another bridge range, update `set_real_ip_from` in `deploy/auth.conf` to that actual range before deployment. Do not publish the frontend directly on a public interface or place an untrusted proxy in this boundary. Tailscale's [versioned proxy implementation](https://github.com/tailscale/tailscale/blob/v1.104.7/ipn/ipnlocal/serve.go) replaces forwarded client headers before forwarding. Clients sharing a public IP share a budget.

Run `python3 check_rate_limit.py http://127.0.0.1:18096/blockcalc/ --credentials-file /private/login.json` through an operator-only loopback connection. This read-only check uses reserved synthetic IPv4/IPv6 forwarded addresses, verifies 401/429 behavior across routes, checks client separation and health, then checks recovery. It must not run against a public hostname: only the trusted operator endpoint may supply these fixtures. CI runs it against isolated containers and confirms the private profile stays unthrottled.

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

## After the owner merges the PR

The preview currently uses the tested feature-branch commit. After the owner merges, fetch and check out the actual resulting `main` commit in a separate release checkout. Build both images from that exact tree with its commit tag and the public frontend base path, run the suites/container checks, and record new image IDs/checksums. Take a current backup, deploy through the stable public Compose project, and repeat authenticated/public smoke checks. Retain the previous release and snapshot. Do not merely retag the branch-built images as the merge commit. This is a future operator step; this PR does not merge or push to `main`.
