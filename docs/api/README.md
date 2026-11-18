# API contract

The contract between `frontend/` and `backend/`. The backend is FastAPI, so its live OpenAPI document at `/docs` (`/openapi.json`) is authoritative for every endpoint it has implemented. This page records the shared conventions and records the implemented endpoints.

The frontend's TypeScript version of this contract is [`frontend/src/api/types.ts`](../../frontend/src/api/types.ts) and [`client.ts`](../../frontend/src/api/client.ts). For offline frontend development, the in-browser mock (`frontend/src/api/mock/`) implements it with the same rules.

## Conventions

| Topic | Rule |
|---|---|
| Field names | snake_case |
| Decimals (prices, weights, tons, costs) | JSON strings such as `"10.50"`, never floats |
| Counts (quantities, molds, yields, batches) | JSON integers |
| Timestamps | ISO 8601 with a timezone offset; elapsed hours ignore the display timezone (§8.4) |
| Optimistic locking | Records carry `version`; a write sends the version it read. A stale version returns `409 { detail: { message, current_version } }` (FR32) |
| Validation | `422 { detail: [{ loc, msg, type }] }`, with `loc` pointing at the field, e.g. `["body", "mix_yields", 0, "full_yield"]` (NFR02) |
| Repeated events | Production and collection events carry a client `event_key`; repeating one returns the current state without counting twice (FR31) |
| Atomic writes | A failed write changes nothing (NFR04) |
| Actor | The single first-release User is recorded as `local-user` on history (FR30) |

## Implemented

### `GET /api/settings`, `PUT /api/settings`

Owned by #4 and implemented on `ali/backend-foundation`; see [backend README](../../backend/README.md). The read returns prices per ton, `currency`, `full_molds`, `half_molds`, kilograms per wheelbarrow and the four `mixes` with recipes and editable yields. The update sends every value plus `version`, `mix_yields` (one entry per mix) and `confirmed_zero_prices` for any newly zero price.

## Implemented project and production endpoints

| Method and path | Body | Returns |
|---|---|---|
| `POST /api/calculations` | `{ full_quantity, half_quantity, mix_id }` | Material calculation using current settings |
| `GET /api/projects?status=` | – | Paged project records with their current estimate; supports limit and offset |
| `GET /api/projects/summaries?status=` | – | Frontend list items with saved currency, cost, and expected readiness |
| `POST /api/projects` | Name, timezone-aware requested_start_at, full_quantity, half_quantity, optional mix_id | Project record |
| `GET /api/projects/{id}` | – | Project record and current estimate |
| `PUT /api/projects/{id}` | Project fields + version | Updated project record |
| `POST /api/projects/{id}/calculate` | version, optional use_current_prices and confirm_recalculation | Preview with version, settings_version, inputs, result, price_source |
| `POST /api/projects/{id}/estimates` | Preview options + settings_version | Updated project record with an immutable estimate revision |
| `GET /api/projects/{id}/estimates` | – | Original revision history |
| `GET /api/projects/{id}/estimates/{revision}` | – | Original saved inputs and result |
| `GET /api/projects/{id}/production` | – | Frontend ProjectDetail with estimates, runs, collections, balances, forecast, history |
| `POST /api/projects/{id}/plan` | project_version | ProjectDetail with a saved production plan |
| `POST /api/projects/{id}/runs/{run_id}/start` | event_key, started_at | ProjectDetail |
| `POST /api/projects/{id}/runs/{run_id}/ready` | event_key, ready_at, physically_checked | ProjectDetail |
| `POST /api/projects/{id}/collections` | event_key, full_quantity, half_quantity, collected_at | ProjectDetail |
| `POST /api/projects/{id}/cancel` | project_version, reason | ProjectDetail |
| `GET /health` | – | Database health and schema version |

The HTTP client adapts draft and estimate responses to the frontend interface. It previews an estimate and sends the returned settings version when saving, then reloads the production detail. Original revision endpoints use `inputs.project`, `inputs.settings`, and `result`; the production view exposes the frontend snapshot fields `inputs.order`, `inputs.mix`, `inputs.settings`, and `results`.

The first estimate uses current settings. Revisions reuse saved settings until both `use_current_prices` and `confirm_recalculation` are true. A changed project or calculation settings version returns 409. Stateless previews report missing inputs as `422 { detail: { message, missing_fields } }`. Project previews report field paths in `detail[].loc`.

Event keys are scoped to a project. Retrying the same event returns the current state; changing an already used key's payload returns 409. Readiness needs 48 actual elapsed hours and a physical check. Event timestamps retain their offset and cannot be in the future.

Forecasts assume each project's molds are available independently. After planning, capacities come from the saved plan. Positive demand with zero matching molds has no completion time. Orders whose completion falls outside the supported calendar remain readable with an unavailable forecast; planning returns a validation error. A delay shifts the following matching runs in that project. The clock never automatically marks blocks ready.

Collection is bounded by ready minus collected quantities for each size, including partial collections. Cancellation keeps active runs, cancels waiting work, preserves history, and allows collection from ready blocks. The cancelled status is retained.

`ProjectDetail`, `ProjectListItem`, `ProductionRun`, `Forecast`, and `MaterialCalculation` are defined in [the frontend types](../../frontend/src/api/types.ts). The generated schema below defines the backend wire representations.

## Switching the frontend to the backend

```bash
# frontend/.env.local
VITE_API_MODE=http
VITE_API_BASE_URL=http://127.0.0.1:8000
```

The backend's default `BLOCKCALC_CORS_ORIGINS` already allows the frontend dev server at `http://localhost:5173`.

## Schema snapshot

[openapi.yaml](openapi.yaml) is generated from the FastAPI application using JSON syntax, which is valid YAML. From `backend/`, regenerate it with `uv run --locked python -m blockcalc.export_openapi ../docs/api/openapi.yaml`. CI compares it with the application schema.

Backend tests cover the worked examples, saved prices, revisions, capacity limits, duplicate events, concurrent collections, cancellation, rollback, and backup restoration. The frontend HTTP integration suite runs against an isolated real FastAPI process.
