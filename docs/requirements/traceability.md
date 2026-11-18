# Traceability

Each requirement and acceptance check from the [study](study.md) maps to the issues that deliver it. Frontend paths are under `frontend/src/`.

## Functional requirements

| Requirement | Feature | Frontend issue | Backend issue | Frontend location |
|---|---|---|---|---|
| FR01–FR06 Settings, currency, molds, yields, weights, validation | FE01 | #2 | #3, #4 | `features/settings`, route `/settings` |
| FR07–FR08 Create and edit a draft | FE02 | #6 | #9 | `features/projects` (draft form), route `/projects/new` |
| FR09–FR10 Select and require a mix | FE02 | #6 | #9 | `features/projects` (mix picker) |
| FR11–FR14 Quantities, cost, breakdown, missing inputs | FE03 | #6, #7 | #8 | `api/mock/rules/materials.ts` |
| FR15–FR17 Save estimate, keep prices, revisions | FE03 | #7 | #9 | `features/estimates` (revisions, price snapshot) |
| FR18 Lock an active order | FE02 | #11 | #12 | `api/mock/rules/production.ts` (`isOrderLocked`) |
| FR19–FR21 Completion forecast | FE04 | #11 | #8, #12 | `api/mock/rules/production.ts` |
| FR22–FR24 Runs, readiness, delay | FE05 | #11 | #12 | `features/production` |
| FR25–FR26 Collection | FE05 | #11 | #12 | `features/collection` |
| FR27–FR28 Project list and summary | FE06 | #10 | #9 | route `/projects`, `/projects/$projectId` |
| FR29 Cancel a project | FE05 | #10 | #12 | `features/projects` (cancel dialog) |
| FR30 History | FE06 | #10 | #3, #12 | project summary history list |
| FR31 Repeated events | FE06 | #20 | #12 | `api/mock` event keys |
| FR32 Conflicting edits | FE06 | #20 | #9 | `api/mock` record versions |

## Non-functional requirements

| Requirement | Issue | How it is checked |
|---|---|---|
| NFR01 Functional suitability | #6, #7, #11, #8 | Unit tests reproduce §8.5 and §8.6 |
| NFR02 Units and field errors | #2, #6, #18 | Component tests; affordance checklist |
| NFR03 Keyboard, 360 px and 1280 px | #13, #18 | Browser checks at both widths, keyboard only |
| NFR04 Keep the last complete record | #20, #9 | Mock and API reject partial writes |
| NFR05 Daily backup restore | #15 | Backend restore drill |
| NFR07 Rules testable apart from screens | #20, #8 | Pure rules in `api/mock/rules/` and the backend's `calculation.py`, each with its own tests |
| NFR08 Agreed browsers | #13, #16 | Manual run on desktop Chrome, Firefox and one phone browser |
| BO04 Ease of use | #18, #16 | [Usability test plan](../ux/usability-test-plan.md) |

## Acceptance checks

Frontend tests are in `frontend/src/tests/api/` (`rules.test.ts`, `mock-client.test.ts`); backend tests in `backend/tests/`.

| Check | Frontend test |
|---|---|
| AT01 Invalid settings or quantities | `mock-client.test.ts` › settings, projects |
| AT02 Calculate without a mix | `rules.test.ts`, `mock-client.test.ts` |
| AT03 Worked example (54 batches, 691.20 RUB, 1632 h) | `rules.test.ts` |
| AT04 Mix 1 (86 batches, 688.00 RUB) | `rules.test.ts` |
| AT05 Saved estimate keeps its prices | `mock-client.test.ts` |
| AT06 51 full blocks, 50 molds → 96 h; no molds → no forecast | `rules.test.ts` |
| AT07 Independent forecasts | `rules.test.ts` |
| AT08 Run confirmed at hour 60 | `rules.test.ts` |
| AT09 Collect 6 accepted, 7 rejected | `mock-client.test.ts` |
| AT10 Cancel with active and waiting runs | `mock-client.test.ts` |
| AT11 Repeated event, conflicting edit | `mock-client.test.ts` |
| AT12 Interrupted save, backup restore | Backend (#14, #15) |

## Backend implementation and verification

| Requirement or check | Backend implementation | Automated evidence |
|---|---|---|
| FR01–FR06, AT01 | `settings.py`, migrations | `test_settings.py` |
| FR07–FR10, FR15–FR18, FR27–FR28, FR32, AT02, AT05 | `projects.py` | `test_projects.py` |
| FR11–FR14, AT03–AT04 | `calculation.py` | `test_calculation.py` |
| FR19–FR24, AT06–AT08 | `production.py` | `test_production.py` |
| FR25–FR26, AT09 | `production.py` | Collection bounds and concurrent collection tests |
| FR29–FR31, AT10–AT11 | Production transactions and immutable audit events | Cancellation, replay, conflict, and rollback tests |
| NFR04–NFR05, AT12 | Transactional migrations and `backup.py` | `test_operations.py`, deployment restore drill |
| Frontend HTTP contract | `frontend/src/api/http.ts` | `frontend/src/tests/api/http-client.test.ts` against a real FastAPI process |

Backend paths are under `backend/blockcalc/`. The schema snapshot is `docs/api/openapi.yaml`. Deployment and backup procedures are in [staging operations](../deployment/staging.md).
