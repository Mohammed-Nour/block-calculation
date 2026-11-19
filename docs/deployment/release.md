# Full application deployment

This candidate adds a production build of the frontend to the reviewed backend. It targets the agreed private staging host and keeps the existing backend staging installation available. It does not publish the application to the internet or mark the customer release complete.

## What runs

`deploy/compose.yaml` runs two services. Only the frontend publishes a port, bound to loopback by default. Its NGINX process serves the SPA and forwards `/api/`, `/health`, and API documentation to the internal backend. The production frontend always uses HTTP and relative API URLs. It cannot default to the browser mock because an environment file was omitted.

Both containers run without root, with read-only root filesystems and writable temporary directories. SQLite data and backups use named volumes. Logs rotate. Health checks require the real backend to answer. Docker DNS is refreshed after backend replacement. HTML is revalidated while hashed assets are cached.

The base images are pinned by digest, application dependencies use their lockfiles, and frontend and backend images share a reviewed commit tag. See the [unprivileged image documentation](https://github.com/nginx/docker-nginx-unprivileged) for the runtime's temporary paths and [NGINX proxy documentation](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass) for variable-based upstream routing.

## Prepare a release

Run from a clean checkout of the reviewed commit. Keep the deployment environment outside version control. Use a stable Compose project name for an installation; changing it selects different data volumes.

```sh
cp deploy/.env.example deploy/.env
# Edit deploy/.env: set BLOCKCALC_RELEASE to the reviewed commit.
# For private host access, set the bind address to its private interface.
docker compose -f deploy/compose.yaml --env-file deploy/.env config --quiet
docker compose -f deploy/compose.yaml --env-file deploy/.env build
docker compose -f deploy/compose.yaml --env-file deploy/.env up -d --no-build --wait --wait-timeout 120
python3 deploy/smoke.py http://127.0.0.1:18096
```

When operating from `deploy/`, Compose automatically reads its `.env`. Pin the image tags before starting; do not rebuild a reviewed image during promotion. To transfer images without a registry, use `docker image save` on the prepared images and `docker image load` on the host. Verify the release manifest and checksums before starting them. The source archive must include `docs/api/openapi.yaml` for the smoke check.

The candidate uses its own `blockcalc-candidate_data` and `blockcalc-candidate_backups` volumes. It starts with unconfigured inputs. Enter measured customer settings during onboarding. Test fixtures belong in isolated QA volumes.

## Preserve existing records at cutover

1. Confirm the destination project name, private bind address, port, reviewed image tags, and release gates below. Record the current image IDs and schema version.
2. Stop user writes on the old installation. Take its final online backup using the existing [staging procedure](staging.md), export the selected snapshot to a protected host directory, and stop the old backend before opening the new installation for writes.
3. Start the candidate once to create its named volumes, then restore that selected snapshot. The restore helper stops the candidate backend, imports the snapshot as the application user, validates it, upgrades its schema, and restarts the stack. A failed import leaves the service stopped so the failure can be investigated.

```sh
cd deploy
./restore.sh /absolute/path/to/selected.sqlite3
python3 smoke.py http://127.0.0.1:18096
```

4. Check saved settings, project quantities, estimate prices and currency, run history, and collection balances against the snapshot. Confirm both containers are healthy before sharing the new private frontend address.
5. Keep the previous images and backup. Keep the old backend stopped to avoid two independent databases receiving writes. Do not remove any data volume during promotion or rollback.

## Backup and recovery

`deploy/backup.sh` creates a checked online snapshot in the installation's backup volume. Before production release, agree the time, timezone, retention, destination, and responsible operator in [customer questions](../process/customer-questions.md). The existing 03:00 staging job remains provisional and continues to protect its existing installation. At cutover, point the agreed job at `<deployment-root>/current/deploy/backup.sh` for the new installation. Verify a fresh snapshot after changing the job.

For recovery, stop writes, retain a current backup, and use `restore.sh` with the selected snapshot. The helper validates integrity and foreign keys before replacing the destination. Verify `/health`, saved projects, estimates, production, and collection after restoring. Record which snapshot was selected and any records created after it; restoring an older snapshot requires an explicit decision about those records.

## Rollback

For an application rollback with a compatible schema, stop writes, back up the current database, select the previous frontend and backend tags in the deployment environment, and run Compose with `--no-build --wait`. Re-run the smoke check and read a saved project. The named data volumes stay attached to the same project.

If a previous application cannot read the current schema, retain the latest backup and follow the selected-snapshot recovery procedure. Do not overwrite newer customer records merely to get an older image running. First-release schema version 2 is unchanged by this deployment packaging.

## Release gates

| Gate                 | Required evidence                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Code and contract    | Backend tests, frontend checks/build, live HTTP tests, schema parity, and container smoke CI pass                       |
| Packaging            | Correct HTTP frontend, SPA reloads, API error/query routing, non-root users, persistent volumes, and healthy containers |
| Recovery             | Backend replacement retains records; online backup and isolated restore compare all business tables                     |
| Browsers             | Complete workflow in Chrome and Firefox; record the customer's agreed physical phone browser and run it before release  |
| Customer walkthrough | Five first-time users and BO04 results recorded in `docs/ux/usability-results.md` under #16                             |
| Operations agreement | Backup arrangements, retention, and recovery owner agreed in `docs/process/customer-questions.md`                       |
| Promotion            | Review the exact candidate images and checksum manifest; confirm cutover target and selected snapshot                   |

See [the final review record](release-review.md) for completed checks and remaining gates. Issue #16 stays open until the customer-facing work is complete.
