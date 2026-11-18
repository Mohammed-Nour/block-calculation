# Traceability

Each requirement and acceptance check from the [study](study.md) maps to the issues that deliver it. Frontend paths are under `frontend/src/`.

## Functional requirements

| Requirement | Feature | Frontend issue | Backend issue | Frontend location |
|---|---|---|---|---|
| FR01–FR06 Settings, currency, molds, yields, weights, validation | FE01 | #2 | #3, #4 | `features/settings`, route `/settings` |
| FR07–FR08 Create and edit a draft | FE02 | #6 | #9 | `features/projects` (draft form), route `/projects/new` |
| FR09–FR10 Select and require a mix | FE02 | #6 | #9 | `features/projects` (mix picker) |
| FR11–FR14 Quantities, cost, breakdown, missing inputs | FE03 | #6, #7 | #8 | `features/estimates/utils/material-calculation.ts` |
| FR15–FR17 Save estimate, keep prices, revisions | FE03 | #7 | #9 | `features/estimates` (revisions, price snapshot) |
| FR18 Lock an active order | FE02 | #11 | #12 | `features/projects/utils/project-status.ts` |
| FR19–FR21 Completion forecast | FE04 | #11 | #8, #12 | `features/production/utils/forecast.ts` |
| FR22–FR24 Runs, readiness, delay | FE05 | #11 | #12 | `features/production` |
| FR25–FR26 Collection | FE05 | #11 | #12 | `features/collection` |
| FR27–FR28 Project list and summary | FE06 | #10 | #9 | route `/projects`, `/projects/$projectId` |
| FR29 Cancel a project | FE05 | #10 | #12 | `features/projects` (cancel dialog) |
| FR30 History | FE06 | #10 | #3, #12 | project summary history list |
| FR31 Repeated events | FE06 | #20 | #12 | `api/` idempotency keys |
| FR32 Conflicting edits | FE06 | #20 | #9 | `api/` record versions |

## Non-functional requirements

| Requirement | Issue | How it is checked |
|---|---|---|
| NFR01 Functional suitability | #6, #7, #11, #8 | Unit tests reproduce §8.5 and §8.6 |
| NFR02 Units and field errors | #2, #6, #18 | Component tests; affordance checklist |
| NFR03 Keyboard, 360 px and 1280 px | #13, #18 | Browser checks at both widths, keyboard only |
| NFR04 Keep the last complete record | #20, #9 | Mock and API reject partial writes |
| NFR05 Daily backup restore | #15 | Backend restore drill |
| NFR07 Rules testable apart from screens | #6, #8 | Calculation lives in pure `utils/` files with their own tests |
| NFR08 Agreed browsers | #13, #16 | Manual run on desktop Chrome, Firefox and one phone browser |
| BO04 Ease of use | #18, #16 | [Usability test plan](../ux/usability-test-plan.md) |

## Acceptance checks

| Check | Where it is tested |
|---|---|
| AT01 Invalid settings or quantities | `features/settings/tests`, `features/projects/tests` |
| AT02 Calculate without a mix | `features/projects/tests` |
| AT03 Worked example (54 batches, 691.20 RUB, 1632 h) | `features/estimates/tests`, `features/production/tests` |
| AT04 Mix 1 (86 batches, 688.00 RUB) | `features/estimates/tests` |
| AT05 Saved estimate keeps its prices | `features/estimates/tests`, `api/mock` tests |
| AT06 51 full blocks, 50 molds → 96 h | `features/production/tests` |
| AT07 Independent forecasts | `features/production/tests` |
| AT08 Run confirmed at hour 60 | `features/production/tests` |
| AT09 Collect 6 accepted, 7 rejected | `features/collection/tests` |
| AT10 Cancel with active and waiting runs | `features/projects/tests` |
| AT11 Repeated event, conflicting edit | `api/mock` tests |
| AT12 Interrupted save, backup restore | Backend (#14, #15) |
