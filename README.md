# BlockCalc

BlockCalc helps a small block-production team manage settings, estimate material costs, plan 48-hour mold cycles, and track production and collection.

The project study in [`docs/requirements/`](docs/requirements/study.md) is the source of truth. Every feature, rule and acceptance check in the code traces back to it ([traceability](docs/requirements/traceability.md)).

## Repository layout

| Path | Contents | Owner |
|---|---|---|
| [`frontend/`](frontend/) | React + TanStack Router single-page app | Mohamad Nour |
| [`backend/`](backend/) | API and database (see [API contract](docs/api/)) | Ali Hamdan |
| [`docs/`](docs/) | Requirements, architecture, API contract, UX and process documents | Both |

## Team

- Mohamad Nour — frontend
- Ali Hamdan — backend and deployment

## Run the frontend

```bash
cd frontend
pnpm install
pnpm dev
```

## How we work

Every change starts as a GitHub issue, is built on its own branch and lands through a reviewed pull request. See [docs/process/workflow.md](docs/process/workflow.md).

## First-release boundary

- One User role; no authorization in the first release.
- Prices for sand, 13 mm stone, and cement are entered per metric ton in RUB by default.
- Full blocks are 400 × 200 × 200 mm; half blocks are 200 × 200 × 200 mm.
- Mix selection is required before calculation.
- Full and half block yields are configured separately for every mix.
- One mold makes one matching block in a 48-hour preparation-and-curing cycle.
- Saved estimates keep their price inputs and do not change when Settings change later.
