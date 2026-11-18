# API contract

The contract between `frontend/` and `backend/`. The backend is FastAPI, so its live OpenAPI document at `/docs` (`/openapi.json`) is authoritative for every endpoint it has implemented. This page records the shared conventions and proposes the endpoints that do not exist yet, so both sides can build against the same shapes.

The frontend's TypeScript version of this contract is [`frontend/src/api/types.ts`](../../frontend/src/api/types.ts) and [`client.ts`](../../frontend/src/api/client.ts). Until an endpoint exists, the in-browser mock (`frontend/src/api/mock/`) implements it with the same rules.

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

## Proposed (frontend mock implements these; backend #8, #9, #12)

| Method and path | Body | Returns | Rules |
|---|---|---|---|
| `POST /api/calculations` | `{ full_quantity, half_quantity, mix_id }` | `MaterialCalculation` | Preview with current Settings; saves nothing. Missing inputs return `422 { detail: { message, missing_fields } }` (FR10, FR14) |
| `GET /api/projects?status=` | – | `ProjectListItem[]` | Newest first; optional status filter (FR27) |
| `POST /api/projects` | `{ name, requested_start_at, full_quantity, half_quantity, mix_id }` | `ProjectDetail` | §8.2 validation; `mix_id` may be null for a draft (FR07) |
| `GET /api/projects/{id}` | – | `ProjectDetail` | Estimates, runs, collections, balances, forecast and history (FR28) |
| `PUT /api/projects/{id}` | project fields + `version` | `ProjectDetail` | Only `draft` or `planned`; a change to the order or mix clears the plan (FR08, FR18) |
| `POST /api/projects/{id}/estimates` | `{ project_version, use_current_prices }` | `ProjectDetail` | Appends an immutable revision with all inputs; keeps the previous revision's prices unless `use_current_prices` (FR15–FR17) |
| `POST /api/projects/{id}/plan` | `{ project_version }` | `ProjectDetail` | Needs an estimate for the current order and molds for every ordered size; splits each size into runs no larger than its mold count (FR19–FR22) |
| `POST /api/projects/{id}/runs/{run_id}/start` | `{ event_key, started_at }` | `ProjectDetail` | One active run per size, so molds are never over-used (FR22) |
| `POST /api/projects/{id}/runs/{run_id}/ready` | `{ event_key, ready_at, physically_checked }` | `ProjectDetail` | At least 48 hours after start and a physical check; later runs move with it (FR23, FR24) |
| `POST /api/projects/{id}/collections` | `{ event_key, full_quantity, half_quantity, collected_at }` | `ProjectDetail` | Within ready minus collected for each size; marks the project `collected` when the whole order is collected (FR25, FR26) |
| `POST /api/projects/{id}/cancel` | `{ project_version, reason }` | `ProjectDetail` | Cancels waiting runs, keeps active runs and history; rejected when `collected` (FR29, SC06) |

`ProjectDetail`, `ProjectListItem`, `EstimateRevision`, `ProductionRun`, `Forecast` and `MaterialCalculation` are defined field by field in [`types.ts`](../../frontend/src/api/types.ts). `MaterialCalculation` matches `blockcalc/calculation.py`.

Status is derived from what has happened: `draft` → `planned` → `in_production` → `partially_ready` → `ready` → `collected`, or `cancelled` (§8.4).

## Switching the frontend to the backend

```bash
# frontend/.env.local
VITE_API_MODE=http
VITE_API_BASE_URL=http://127.0.0.1:8000
```

The backend's default `BLOCKCALC_CORS_ORIGINS` already allows the frontend dev server at `http://localhost:5173`.
