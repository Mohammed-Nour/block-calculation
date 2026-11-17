# BlockCalc

BlockCalc helps a small block-production team manage settings, estimate material costs, plan 48-hour mold cycles, and track production and collection.

## Team

- Mohamad Nour — frontend
- Ali Hamdan — backend and deployment

## Run locally

\`\`\`bash
pnpm install
pnpm dev
\`\`\`

## First-release boundary

- One User role; no authorization in the first release.
- Prices for sand, 13 mm stone, and cement are entered per metric ton in RUB by default.
- Full blocks are 400 × 200 × 200 mm; half blocks are 200 × 200 × 200 mm.
- Mix selection is required before calculation.
- Full and half block yields are configured separately for every mix.
- One mold makes one matching block in a 48-hour preparation-and-curing cycle.
- Saved estimates keep their price inputs and do not change when Settings change later.
