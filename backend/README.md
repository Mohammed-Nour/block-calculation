# BlockCalc backend

The FastAPI service implements settings, project drafts, immutable material estimates, independent production forecasts, production runs, readiness, collections, cancellation, and audit history.

## Local setup

Use Python 3.12 and uv from the repository root.

```sh
cd backend
uv sync --locked --python 3.12
uv run --locked uvicorn blockcalc.app:app --reload
```

Startup applies consecutive SQL migrations in a transaction. The default database is `backend/data/blockcalc.sqlite3`. Set `BLOCKCALC_DB_PATH` to an absolute file path for persistent deployment storage. `BLOCKCALC_CORS_ORIGINS` is a comma-separated list of browser origins, defaulting to `http://localhost:5173,http://127.0.0.1:5173`.

The service exposes [interactive API documentation](http://127.0.0.1:8000/docs), `/openapi.json`, and `/health`. The health endpoint queries the database and returns `503` if it is unavailable. The first release records the single actor as `local-user`.

## Verification

```sh
uv run --locked python -m unittest discover -s tests -v
uv run --locked python -m blockcalc.export_openapi ../docs/api/openapi.yaml --check
```

From `frontend/`, run `BLOCKCALC_TEST_PYTHON=../backend/.venv/bin/python pnpm check` and `pnpm build`. The HTTP integration tests start an isolated FastAPI process and database and exercise the frontend's real HTTP client. Frontend CI installs both runtimes and runs those tests.

See the [API contract](../docs/api/README.md) for request and response details, the [generated schema](../docs/api/openapi.yaml), and [staging operations](../docs/deployment/staging.md) for deployment, daily backups, restoration, and rollback.

The [full application deployment](../docs/deployment/release.md) adds the HTTP frontend and a same-origin proxy while keeping this service internal. It uses separate candidate volumes and does not replace the existing backend-only staging installation during preparation.
