# BlockCalc

BlockCalc helps a small block-production team manage settings, estimate material costs, plan 48-hour mold cycles, and track production and collection.

## Team

- Mohamad Nour — frontend
- Ali Hamdan — backend and deployment

## Run locally

The frontend uses Node.js 24 and pnpm 11.25.0.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

The backend uses Python 3.12, SQLite 3.38 or newer, and uv. In a second terminal, run from the repository root.

```bash
cd backend
uv sync --locked --python 3.12
uv run --locked uvicorn blockcalc.app:app --reload
```

The API starts at `http://127.0.0.1:8000`, with OpenAPI documentation at `/docs`. Startup applies pending database migrations. To apply the same migrations without starting the server, run `uv run --locked python -m blockcalc.db` from `backend/`.

## Settings API

`GET /api/settings` returns material prices per metric ton, currency, full and half mold counts, measured kilograms per wheelbarrow, and the four mix recipes with their editable yields.

`PUT /api/settings` replaces the editable values. Include the `version` from the last read, the currency and all seven price, mold, and weight fields, and a `mix_yields` array with one `{ "id": 1, "full_yield": 35, "half_yield": 60 }` entry per mix (IDs 1 through 4).

- Send prices and weights as decimal strings such as `"100.25"`. Unconfigured prices, weights, and yields may be `null`.
- Send mold counts as nonnegative integers and configured yields as positive integers.
- When entering a new zero price, include its material in `confirmed_zero_prices`, for example `["sand"]`. Allowed materials are `sand`, `stone`, and `cement`.
- Enter a three-letter currency code. The API stores it in uppercase and keeps the entered prices.
- A successful save returns the updated settings and version. A stale version returns `409`. Invalid fields return `422` with paths in `detail[].loc`.

## Projects and estimate revisions API

| Method | Endpoint | Result |
| --- | --- | --- |
| POST | `/api/projects` | Create a draft |
| GET | `/api/projects` | List projects with optional `status`, `limit`, and `offset` filters |
| GET | `/api/projects/{id}` | Read the project and its current estimate |
| PUT | `/api/projects/{id}` | Update draft fields using the last read `version` |
| POST | `/api/projects/{id}/calculate` | Preview the material calculation |
| POST | `/api/projects/{id}/estimates` | Save a new estimate revision and return the updated project |
| GET | `/api/projects/{id}/estimates` | Read the revision history in revision order |
| GET | `/api/projects/{id}/estimates/{revision}` | Read an original saved revision |

Create a draft with `name`, `requested_start_at`, `full_quantity`, `half_quantity`, and an optional `mix_id` (1 through 4). Names contain 1 to 100 characters, quantities are nonnegative integers, and the order contains at least one block. Start times include a timezone offset, for example `2026-11-18T09:00:00+03:00`. A draft can omit its mix until calculation.

Preview with `{ "version": 1 }`, using the project's current version. Save with the same options plus the `settings_version` returned by the preview. The server calculates and saves the snapshot. A successful save increments the project version and the estimate revision. A changed project or calculation settings version returns `409`. Missing required calculation inputs return `422` with field paths in `detail[].loc`.

The first estimate uses current settings. Subsequent revisions reuse the last saved settings, including prices, currency, recipes, yields, and conversion factors. To refresh those inputs, send both `use_current_prices: true` and `confirm_recalculation: true` when previewing and saving. Each revision retains its order, settings, conversion constants, and calculated results.

An update includes all draft fields and the last read `version`. Changing quantities or mix returns the project to Draft, clears its current estimate, and cancels waiting runs. The previous estimate remains in revision history. Quantities and mix are locked after production starts. The project list defaults to 50 records, supports up to 100 per request, and returns newest projects first.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `BLOCKCALC_DB_PATH` | `backend/data/blockcalc.sqlite3` | SQLite database path. Relative overrides resolve from the server's working directory. |
| `BLOCKCALC_CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated frontend origins. Set it to an empty string for same-origin use. |

The Settings API requires no credentials. CI runs on pull requests and on pushes to `main`. Run the checks locally with `pnpm build` from the root and `uv run --locked python -m unittest discover -s tests -v` from `backend/`.

## First-release boundary

- One User role; no authorization in the first release.
- Prices for sand, 13 mm stone, and cement are entered per metric ton in RUB by default.
- Full blocks are 400 × 200 × 200 mm; half blocks are 200 × 200 × 200 mm.
- Mix selection is required before calculation.
- Full and half block yields are configured separately for every mix.
- One mold makes one matching block in a 48-hour preparation-and-curing cycle.
- Saved estimates keep their price inputs and do not change when Settings change later.
