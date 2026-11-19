# Final engineering review — 19 November 2026

The application is packaged and verified as a candidate for the agreed private host. Production promotion still requires the customer-facing checks below. No production database was migrated or replaced during preparation.

## Reviewed baseline and scope

Mohamad merged the reviewed frontend stack and backend PR #32. The `ali/backend-foundation` baseline `2fa8f5e` has the same application tree as merged `main` commit `0f6f4de`. This preparation keeps the business rules and API contract unchanged and adds the full application container deployment, smoke checks, recovery helpers, and operator documentation. No additional functional blocker was found in the reviewed application.

The candidate uses digest-pinned base images, locked Python and frontend dependencies, an HTTP-only production frontend, and an internal API. The reviewed release commit, tested image IDs, platform, and archive checksums belong in the release package's manifest rather than a manually maintained example hash in this document.

## Completed verification

| Check                    | Result                                                                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend suite            | 79 tests passed, including four mixes, missing inputs, immutable estimates, production, cancellation, concurrency, interrupted saves, and backup recovery            |
| Frontend suite           | 75 tests passed, including five tests against a real isolated FastAPI process                                                                                        |
| Source checks            | Conventions, formatting, ESLint, TypeScript, frontend build, and generated OpenAPI parity passed                                                                     |
| Dependency audit         | Configured audit passed with the existing documented tooling exceptions retained                                                                                     |
| Deployment configuration | Compose validation, workflow validation, Python lint, and shell syntax checks passed                                                                                 |
| Container build          | Both locked application builds passed; base images pinned to the digests verified during preparation                                                                 |
| Runtime                  | Backend UID 10001, frontend UID 101; healthy services, read-only root filesystems, persistent data/backup volumes, rotated logs                                      |
| Routing                  | Same-origin API, query parameters and field errors, SPA reloads, missing assets, HTML refresh, hashed-asset caching, and live OpenAPI parity passed                  |
| Backend replacement      | All records preserved; proxy recovered after a deliberately changed backend IP address                                                                               |
| Restore                  | Selected snapshot restored all seven tables exactly, including six QA projects, twelve estimate revisions, 324 production runs, six collections, and 41 audit events |
| Failed restore           | Corrupt snapshot rejected; backend stayed stopped and the previous destination was preserved; restoring the valid snapshot recovered the stack                       |
| Existing staging         | Backend-only staging remained on its verified release; health and the scheduled backup were checked separately                                                       |

The container deployment workflow now rebuilds the candidate, runs the smoke checks, verifies backup/restore permissions, and checks routing after backend replacement. Feature-branch CI also runs the backend and frontend suites so this preparation can be reviewed without pushing to `main`.

## Packaged browser verification

The exact built frontend and backend were tested together, using isolated local QA volumes. This was a production bundle served by NGINX, not the Vite development server or browser mock.

| Browser                                     | Viewport                | Result                                                                                      |
| ------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------- |
| Chrome 158.0.8127.36                        | 360 × 800               | Passed                                                                                      |
| Chrome 158.0.8127.36                        | 1280 × 800              | Passed                                                                                      |
| Chrome 158.0.8127.36 with Pixel 7 emulation | 412 px width            | Passed; emulation does not replace the agreed physical-phone check                          |
| Firefox 153.0 headless                      | Attempted desktop check | Not verified: the browser failed to initialize its graphics framebuffer in this environment |

The passed workflow covers keyboard navigation, missing-input guidance, the 691.20 RUB worked estimate, the 1632-hour forecast and 54-run plan, physical readiness confirmation, collection limits, and retry after a deliberately lost successful response. Retrying collected six blocks exactly once. Incomplete legacy plans and missing mix details remained readable with the appropriate warnings. No horizontal page overflow or uncaught browser exception was observed in the passed cases.

The QA volumes and snapshots are test fixtures. They must not be imported into customer data or included in the release image/archive.

## Remaining production release gates

| Gate                                  | Status and owner                                                                                                                  |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Desktop Firefox workflow              | Repeat on a working desktop Firefox installation; Mohamad / #16                                                                   |
| Agreed physical phone browser         | Agree browser/version and record a full workflow; Mohamad and customer / #16                                                      |
| Five-user BO04 walkthrough            | Record actual results in `docs/ux/usability-results.md`; Mohamad and customer / #16                                               |
| Backup and record-retention agreement | Record customer representative, schedule/timezone, retention, storage, and recovery owner in `docs/process/customer-questions.md` |
| Cutover review                        | Confirm the target, image manifest/checksums, selected snapshot, and rollback point before production writes move                 |

The [deployment runbook](release.md) provides the commands and the cutover/recovery order. The engineering candidate is ready for review and private-host staging. Production release is not signed off while these gates remain open.
