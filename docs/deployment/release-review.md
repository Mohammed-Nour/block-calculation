# Final engineering review — 19 November 2026

The application is packaged and verified for the agreed host. The owner subsequently authorized a shared-login public preview through Tailscale Funnel. Production signoff still requires the customer-facing checks below. Deployment-specific image IDs, snapshot checksums, and cutover results are recorded with the installation.

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

The container deployment workflow rebuilds the candidate, runs the smoke checks, verifies backup/restore permissions, and checks routing after backend replacement. Pull-request CI runs the backend and frontend suites; push triggers target `main` only.

## PR #33 review follow-up and public preview

Mohamad approved the initial deployment candidate and identified two nonblocking improvements. The workflows and README no longer retain a feature branch in their push triggers. The restore helper now streams the selected snapshot through an automatically removed temporary file, including when validation fails.

The public profile serves `/blockcalc/` with a shared proxy login covering the UI, assets, API, and API documentation. Only the minimal health response is anonymous. The API stays internal and the frontend port stays on loopback. Frontend routes, assets, API requests, and generated API documentation retain the public path prefix. The password hash is mounted from outside the checkout; credentials and databases are excluded from the release archive.

The public container profile passed the read-only smoke check and the same Chrome desktop/mobile-emulation workflow above, including a deep-link reload and the lost-response collection retry. Recovery checks exercise temporary-file cleanup on valid and corrupt snapshots. CI covers both the private root profile and the protected public profile. See [public preview operations](public-preview.md) for access, recovery, credential rotation, and narrow Funnel rollback.

Mohamad's second review approved the shared-login profile. The optional follow-up adds a public-only per-client request budget covering failed logins and every protected route, while exempting health probes. Checks cover IPv4/IPv6 client isolation, a changing earlier forwarded address, 429 responses, and recovery; the private profile remains unthrottled. Rebuilding from the actual merge commit is documented as a future promotion step, without merging or pushing to `main`. The [manual browser checklist](../frontend/manual-browser-checks.md) gives Firefox and physical-phone steps and a result template; it does not claim either outstanding check has passed.

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
| Desktop Firefox workflow              | Automated public workflow passed in Firefox 153.0 using an isolated Playwright browser container; results recorded under #16      |
| Agreed physical phone browser         | Agree browser/version and record a full workflow; Mohamad and customer / #16                                                      |
| Five-user BO04 walkthrough            | Record actual results in `docs/ux/usability-results.md`; Mohamad and customer / #16                                               |
| Backup and record-retention agreement | Record customer representative, schedule/timezone, retention, storage, and recovery owner in `docs/process/customer-questions.md` |
| Cutover review                        | Confirm the target, image manifest/checksums, selected snapshot, and rollback point before production writes move                 |

The [deployment runbook](release.md) provides the cutover/recovery order. The engineering candidate supports staging and the authorized protected preview. Production release is not signed off while these gates remain open.

## Public deployment audit — 19 November 2026

The owner authorized functional testing on the protected public preview. Requests were sent through a public Funnel relay with normal TLS hostname verification, including browser traffic through a restricted local CONNECT proxy. Test projects used a unique `TEST PUBLIC AUDIT` prefix. The original shared Settings were saved and restored after each pass; a separately created non-test draft was preserved. Database snapshots were taken before testing and around deployment updates.

The public API checks covered all four mixes (688.00, 691.20, 729.00, and 637.20 RUB), missing inputs, strict field validation, zero-price confirmation, optimistic locking, immutable revisions, confirmed repricing/currency, forecast boundaries, saved mold capacity, readiness timing and physical confirmation, order locks, cancellation, event replay, and concurrent collection. Six-block replay counted once; competing collections could not exceed ready stock. Unplanned forecasts use current mold counts, while saved plans retain their capacities.

The public browser runs exercised Settings, all mixes, save/reload, revisions, repricing confirmation, production planning, backdated simulated readiness, invalid/valid collection, loss of a successful collection response and retry, cancellation, filters, responsive layouts, and recovery pages. Engines included Chrome 158.0.8127.36 at desktop width and Pixel 7 touch emulation, WebKit 26.5 at desktop width, and Firefox 153.0 at desktop width. Firefox required an isolated browser container because the desktop sandbox could not initialize its graphics framebuffer. These are automated compatibility checks, not a physical-device or five-user usability result.

Two delivery/UX gaps were identified and corrected:

- Static JavaScript was transferred uncompressed: 554,214 bytes, with a sampled download around 18–20 seconds. Asset-only gzip reduced that response to 179,475 bytes (68% smaller); the compressed sample took about 6.6 seconds. Compression is negotiated by the client, includes `Vary: Accept-Encoding`, and the deployment smoke check verifies that decompression reproduces the original asset exactly. Download times are samples and depend on the network and Funnel.
- A missing project fell through to the generic unexpected-error page without a main landmark. Known API 404s now use the existing not-found page, error responses have a main landmark, and two router regression tests verify the message and return-home recovery for 404 and unexpected failures. The frontend suite now contains 77 tests.

Browser probes were corrected where they assumed the error page had a main landmark before that fix, or assumed an overflowing forecast was an object rather than the documented null value. Those probe failures were distinguished from business-rule failures. Detailed before/after checks, release/image identifiers, test-data cleanup, and public recovery rechecks are retained with the operator's audit evidence and summarized on PR #33 / issue #16. Physical-phone acceptance, BO04 participants, and customer operations agreements remain open.
