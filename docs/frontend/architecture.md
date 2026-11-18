# Frontend architecture

The frontend is a React single-page app built with Vite, TanStack Router (file routes) and TanStack Query. Its structure and lint rules follow the team's welding-frontend backbone, minus server rendering: the backend is a separate FastAPI service.

## Layers

Imports flow one way: **app → feature → shared**.

| Layer | Folder | Holds |
|---|---|---|
| app | `src/routes/` | One file per screen. Composes features through their barrels. |
| feature | `src/features/<name>/` | Everything for one area of the study (settings, projects, estimates, production, collection). |
| shared | `src/api`, `src/components`, `src/lib`, `src/data`, `src/schema`, `src/hooks` | Code any feature may use. It never imports a feature or a route. |

Inside a feature, files go in the innermost layer that can hold them:

| Folder | Holds | May import (same feature) |
|---|---|---|
| `types/`, `schema/` | Types and zod schemas | shared, model |
| `data/` | Static values (`*.config.ts`) | + data |
| `utils/` | Pure functions, such as the §8.3 and §8.4 calculation rules | + utils |
| `hooks/queries`, `hooks/mutations`, `hooks/` | React Query hooks and component logic | everything above |
| `components/` | JSX only | everything above |
| `tests/` | Tests for the feature | everything |

Features never import each other. When a screen needs two features (the project summary shows an estimate and a forecast), the route composes them. A feature's `index.ts` is its public surface; anything it does not export is private.

`eslint-plugin-boundaries` enforces these rules, with `eslint-resolver.cjs` so it can resolve `@/` paths. `scripts/tests/eslint-architecture.test.ts` proves the rules still fire.

## Data flow

```
route loader ──ensureQueryData──▶ feature query hook ──▶ api client ──▶ mock (localStorage) or HTTP (FastAPI)
component ──mutation hook──▶ api client ──▶ invalidate the feature's query keys
```

- Server data lives only in React Query. It is never copied into component state.
- Anything worth linking (the project status filter, the summary tab) lives in URL search params, validated with zod in `validateSearch`.
- `VITE_API_MODE=mock` (default) runs against an in-browser implementation of the [API contract](../api/README.md). `VITE_API_MODE=http` calls the backend at `VITE_API_BASE_URL`. Both clients implement the same TypeScript interface, so screens do not know which one is active.

## Calculation rules

The backend owns the saved figures. The frontend keeps a copy of the §8.3 and §8.4 rules in feature `utils/` for previews and the mock API, tested against the study's worked examples (§8.5, AT03–AT09). Both copies must agree on those examples.

## Tooling

| Command | Does |
|---|---|
| `pnpm dev` | Dev server on port 5173 (the origin the backend allows by default) |
| `pnpm check` | Convention script, Prettier, ESLint (`--max-warnings=0`), `tsc`, Vitest |
| `pnpm build` | Production build into `dist/` |

husky runs lint-staged on commit and `pnpm check` + `pnpm build` on push. CI runs the same checks on every pull request that touches `frontend/`.
