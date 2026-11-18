# Frontend coding standards

Each rule names what enforces it: **ESLint**, **conventions** (`scripts/check-conventions.mjs`), **tsc**, or **review**.

## Naming and files

- Files and folders are kebab-case; components are PascalCase; hooks are `useCamelCase` in a `hooks/` folder (conventions).
- Static values live in `data/*.config.ts` as `SCREAMING_SNAKE_CASE` constants (review).
- Always import through `@/`, never with a `..` segment (ESLint).

## Components

- One exported component per file, declared as `export function Name()`. No arrow components and no default exports (conventions, ESLint `func-style`).
- No business logic in components. Move it into a hook when a component has an effect, derived state, or a handler that touches the query cache or router (review).
- Use the primitives in `@/components/ui` instead of raw `<button>`, `<input>`, `<select>`, `<textarea>` or `<dialog>` (ESLint). They carry the focus ring, disabled state and accessible wiring.
- Model async state as a discriminated union and render it with an exhaustive `switch`, not parallel booleans (review).

## No magic values

- Numbers from the study (48-hour cycle, 50 kg cement bag, 1000 kg per ton, block sizes, mix recipes) are named constants in `data/` (review).
- User-facing text that mentions a constant derives it from the constant (review).

## State

| State | Where |
|---|---|
| Data from the API | React Query |
| Linkable view state (filters, tabs) | URL search params |
| Local view state | `useState` |

Query keys come from one factory per feature with a root key (review).

## Pure layers

`utils/`, `data/`, `types/`, `schema/` and `src/lib/` must not call the API or React Query; type-only imports are allowed (ESLint). The calculation rules in `utils/` are tested without a browser (NFR07).

## Types

- `strict` and `noUncheckedIndexedAccess` are on (tsc).
- API types mirror the backend's wire shapes (snake_case fields, decimal strings) and are mapped once at the query boundary (review).

## Accessibility and usability

- Every input has a visible label, its unit, and its error message beside it (NFR02, review).
- All actions work by keyboard and at 360 px and 1280 px (NFR03, review and browser checks).
- See [affordance and heuristics](../ux/affordance-and-heuristics.md) for the per-screen checklist.

## Tests

- Feature tests go in `src/features/<name>/tests/`; shared tests in `src/tests/`; tooling tests in `scripts/tests/`.
- `.test.tsx` only when the test needs a DOM.
- Calculation tests reproduce the study's worked examples and acceptance checks by id (AT03, AT04, ...).
