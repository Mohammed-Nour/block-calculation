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
