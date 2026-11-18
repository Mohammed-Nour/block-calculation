# Backend staging operations

The backend runs on the agreed staging host in a dedicated Docker Compose project named `blockcalc-staging`. It uses persistent `data` and `backups` volumes. Image builds install the versions in `backend/uv.lock` and run as UID 10001.

## Deployment

The installation root is `<deployment-root>`. Each release has its own `releases/<commit>` directory containing the backend source. `current` points to the active release. Each release's `.env` links to the installation's `staging.env`.

The environment selects the image tag, bind address, port, and allowed frontend origins. The staging endpoint is `http://<staging-address>:<port>`, bound to the host's Tailscale interface. Interactive API documentation is at `/docs`. The frontend can connect with `VITE_API_MODE=http` and `VITE_API_BASE_URL=http://<staging-address>:<port>`.

For a new release, export the committed `backend/` files into a new release directory, build `blockcalc-backend:<commit>` with `docker build --network host -t blockcalc-backend:<commit> .`, update `BLOCKCALC_IMAGE` in `staging.env`, and point `current` at the release. Run from `current/`.

```sh
docker compose up -d --wait
docker compose exec -T backend python -m blockcalc.db
curl --fail http://<staging-address>:<port>/health
```

Migrations also run at application startup. Check `docker compose ps` and `docker compose logs --tail=50 backend` if startup fails. The examples in `backend/.env.example` describe the available settings.

## Daily backups

The provisional staging crontab runs `<deployment-root>/current/deploy/backup.sh` daily at 03:00 Europe/Moscow. Backup filenames include a UTC timestamp. The script uses SQLite's online backup API, validates integrity and foreign keys, and atomically publishes the completed file.

```sh
./deploy/backup.sh
docker compose exec -T backend ls -l /backups
```

Backups are retained in the `blockcalc-staging_backups` volume. The deployment keeps them for review and restore. The daily time, timezone, storage arrangements, and retention period require customer agreement before production release; see [customer questions](../process/customer-questions.md). No automatic deletion is configured on staging.

## Restore drill

Restore a selected backup into an isolated file while the service runs, then check its schema, records, and foreign keys.

```sh
docker compose exec -T backend python -m blockcalc.backup restore \
  --source /backups/SELECTED.sqlite3 --output /backups/restore-check.sqlite3
docker compose exec -T backend python -c "import sqlite3; c=sqlite3.connect('/backups/restore-check.sqlite3'); print(c.execute('PRAGMA integrity_check').fetchall()); print(c.execute('PRAGMA foreign_key_check').fetchall())"
```

For recovery of the active database, stop the backend first. Close database connections and checkpoint any remaining journal before replacing the file. A destination with WAL, shared-memory, or rollback-journal files is rejected by the restore command. Use a one-off container sharing the volumes.

```sh
docker compose stop backend
docker compose run --rm --no-deps backend python -m blockcalc.backup restore \
  --source /backups/SELECTED.sqlite3 --output /data/blockcalc.sqlite3
docker compose up -d --wait
```

Restoration validates the backup and upgrades its schema before publishing the recovered database. A failed restore retains the previous destination.

## Rollback

Keep the previous release directory, image tag, and a backup from before migration. Stop the backend, select the previous `BLOCKCALC_IMAGE`, and point `current` to the previous release. If the older application cannot read the migrated schema, restore the pre-migration backup with the matching image while the service is stopped. Start the backend with `docker compose up -d --wait` and verify `/health` and a saved project before returning it to use.

## Staging verification record

The active installation keeps its release hash and verification results in `<deployment-root>/verification.json`. Compare that hash with the deployed image and the PR head when reviewing a new release. This record is updated after deployment so an older example commit cannot be mistaken for the current release.

The verification procedure checks container UID 10001, schema version 2, persistence after restart, live OpenAPI parity, browser POST preflight, and missing-input validation. It also restores an online backup into an isolated database and compares integrity, foreign keys, and every table. The provisional daily backup job remains installed. Staging starts with unconfigured prices and yields, ready for the planner's measured inputs.

The agreed host, private interface address, port, and installation path belong in the deployment environment and internal verification record. Replace the placeholders above with those values when operating staging.
