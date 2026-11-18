# Frontend acceptance and responsive checks

Issue #13. Run against the mock API (`VITE_API_MODE=mock`) in Chromium via Playwright, at 360 × 780 and 1280 × 800, on 18 Nov 2026. Repeat this list before each release (#16) and record the browser versions agreed for NFR08.

## Workflow (worked example from study §8.5)

| Step | Check | Result |
|---|---|---|
| Settings | Prices 10/20/100, weights 100/120 kg, molds 50/15, yields 35/60 (Mix 1: 22/40) save; readiness summary turns to "complete" | Pass |
| New project, no mix | "Calculate cost" shows "Choose a mix…" beside the picker and no cost (AT02, SC01) | Pass |
| New project, Mix 2 | 49 + 5 = 54 batches; 16.2 t, 12.96 t, 2.7 t; total 691.20 RUB; surplus 15 / 0 (AT03) | Pass |
| Save project and estimate | Lands on the summary, revision 1, price snapshot shown | Pass |
| Forecast | 34 and 20 cycles, 1632 h (68 days) (AT03) | Pass |
| Plan production | 34 full runs of 50 and 20 half runs of 15 | Pass |
| Start run | Opens by keyboard; focus starts on the safe "Not yet" | Pass |
| Confirm ready | Earliest time shown; button disabled until the physical check is ticked | Pass |
| Collect 51 of 50 ready | Rejected beside the field, `aria-invalid` set (AT09 pattern) | Pass |
| Project list | Status, mix, quantities, saved cost, expected ready; status filter links | Pass |
| Console | No errors or warnings during the whole run | Pass |

## Responsive and accessibility (NFR02, NFR03)

| Check | 360 px | 1280 px |
|---|---|---|
| No horizontal page scroll | Pass | Pass |
| Navigation reachable (sheet menu / inline links) | Pass | Pass |
| Labels on every input, units beside inputs, errors beside inputs and linked by `aria-describedby` | Pass | Pass |
| Skip link to main content | Pass | Pass |
| Dialogs trap focus and close with Escape (Radix) | Pass | Pass |

## Found and fixed in this pass

| Finding | Heuristic | Fix |
|---|---|---|
| Blank screen while a route loads its data | Visibility of system status | Router-wide skeleton (`PagePending`) after 150 ms |
| At 360 px the mix error appeared above the fold while focus stayed on the button | Error recovery | Focus moves to the mix picker when a mix is missing |
| At 360 px the estimate table scrolled sideways and hid the cost column | Flexibility / mobile layout | "Price / ton" column hidden below 640 px; prices stay in the snapshot |
| A 54-run plan listed every run, burying the next action | Recognition rather than recall; minimalist design | Summary line, only actionable runs shown, full list in a disclosure |

## Still to do before release

- Run the same list in desktop Firefox and one agreed phone browser and record versions (NFR08, #16).
- Repeat the HTTP workflow before release when the backend or UI changes.

## PR #32 review verification, 18 November 2026

Repeated with the real FastAPI backend and `VITE_API_MODE=http`, using an isolated local SQLite database. Browser: Google Chrome 158.0.8127.36, driven through Playwright, at 360 × 800 and 1280 × 800. Sample settings were configured through the local API; production staging was untouched by this browser check.

| Check | 360 px | 1280 px |
|---|---|---|
| Tab navigation, skip link, keyboard mix selection, calculate, save, and plan | Pass | Pass |
| Worked example: 691.20 RUB, 1632 hours, 54 runs | Pass | Pass |
| Start dialog focuses safe cancellation, closes with Escape, and restores focus | Pass | Pass |
| Backdated actual start; physical check required before readiness confirmation | Pass | Pass |
| Collecting 51 of 50 ready gives a linked field error; collecting 6 succeeds | Pass | Pass |
| Legacy incomplete plan shows no completion time and explains the missing coverage | Pass | Pass |
| Missing snapshot mix retains saved cost and explains unavailable mix details | Pass | Pass |
| No horizontal page overflow or uncaught browser exceptions | Pass | Pass |

The missing-settings response was also checked at 360 px: field-path errors list the required inputs and show no cost. The legacy warning checks used deliberately incomplete records in the isolated QA database. Automated regression coverage includes saved yields when changing mixes and legacy mock snapshots.
