# Firefox and physical-phone acceptance check

Run the full workflow once in desktop Firefox and once on the actual phone/browser agreed with the customer. Phone emulation does not close the physical-device check. Use the protected HTTPS preview URL and the owner's private login details; Funnel access needs no Tailscale installation on the test device.

Record the date/timezone, release commit, URL, device model, OS, exact browser version, and pass/fail for every step. In Firefox open `about:support` and record the version under Application Basics ([Mozilla instructions](https://support.mozilla.org/en-US/kb/find-what-version-firefox-you-are-using)). On the phone record the installed browser version; for Safari also record the iOS version. Attach screenshots and the project ID to #16. Keep passwords and authorization headers out of screenshots and console exports.

## Choose the test data

The live preview shares settings and records across every browser. Prefer a disposable QA installation for the example below. If the owner agrees to use the preview for acceptance testing, record existing Settings, use a dedicated test window, name all projects `TEST Firefox <date>` or `TEST Phone <date>`, and restore the previous Settings afterwards. Use only those test projects for simulated production/collection. Resetting browser storage does not reset server data.

For the repeatable example, enter these values in Settings:

| Input                               | Value         |
| ----------------------------------- | ------------- |
| Currency                            | RUB           |
| Sand / stone / cement price per ton | 10 / 20 / 100 |
| Sand / stone kg per wheelbarrow     | 100 / 120     |
| Full / half molds                   | 50 / 15       |
| Mix 1 full / half yield             | 22 / 40       |
| Mixes 2–4 full / half yield         | 35 / 60       |

## Run on each browser

1. Open the HTTPS URL in a fresh private session. Cancelling or entering an incorrect login must not show the app or API records. Enter the correct shared login and open Settings. Save the agreed test settings and reload; the readiness summary must be complete and values retained.
2. Create the named test project with **1700 full blocks and 300 half blocks**. Calculate before selecting a mix: a nearby message must request a mix and no cost should appear. Select **Mix 2**, calculate again, and verify **54 batches**, **691.20 RUB**, **15 full surplus / 0 half surplus**, and a forecast of **1632 hours / 68 days**. Materials are 16.2 t sand, 12.96 t stone, and 2.7 t cement.
3. Save the project and estimate. Check revision 1, quantities, mix, and currency. Reload the project URL directly, then close/reopen it: the same project, revision, and total must remain. Open it on the other device to confirm shared server persistence. All app URLs stay under `/blockcalc/`.
4. In the agreed QA data, change cement to **120**, then reopen the saved project: its estimate remains **691.20 RUB**. A new identical Mix 2 project must calculate **745.20 RUB**. Restore cement to **100** before the next check; the original saved estimate remains unchanged.
5. On the original test project choose **Plan production**. Check **54 runs**: 34 full runs of 50 and 20 half runs of 15. Open Start, cancel, and reopen; cancellation must leave the run waiting.
6. For this simulated test project only, start the first full run with **Started at** set to 72 hours ago, in the device's displayed local timezone. Open Confirm ready. Confirmation must stay disabled until the physical-check checkbox is selected. In the QA simulation, select it and confirm; the balance becomes **50 full ready**. Real production needs an actual physical check.
7. Try collecting **51 full**: expect a field error and no saved collection. Change it to **6**, record the collection, and reload: collected is **6**, available ready is **44**. A reload must not record a second collection. Start the next full run at the current time and check that readiness cannot be confirmed before 48 elapsed hours.
8. Return to Projects, filter by status, and reopen the test project. Check that the saved total, run history, and collected count remain correct. Restore the previous shared Settings after the agreed test window; retain the named test projects as evidence until the owner chooses their cleanup.

## Desktop Firefox checks

- Run at a normal desktop width and at 200% zoom. Read the complete form and saved estimate without page-level horizontal overflow.
- Use Tab/Shift+Tab through navigation, mix choices, inputs, calculate/save, and production dialogs. Use arrow keys for the mix picker and Space for the checkbox. Focus must stay visible.
- Activate Skip to main content. In Start, the safe **Not yet** action initially has focus; Escape closes the dialog and returns focus to its trigger.
- Open the browser developer console and record any uncaught error. In Network, a normal session must load app assets and call the API successfully under `/blockcalc/`. No broken asset/API request or unexpected 429 should occur during ordinary use.

## Actual phone checks

- Open the URL directly in the agreed phone browser. Repeat on mobile data as well as Wi-Fi to confirm public access; record any VPN in use. A new connection may ask for the shared login again.
- Complete the workflow by touch in portrait orientation. Check the menu, mix picker, error text, keyboard, date/time picker, dialogs, and Save/Record actions. The on-screen keyboard must not make a required field or action unreachable.
- Rotate to landscape and back. Check for clipped text, page-level sideways scrolling, or an inaccessible dialog close/cancel action.
- Refresh the saved project, switch to another app, return, and reopen the link. Values and recorded events must persist without duplicates. Record the local timezone used for the backdated test run.

## Record the result

Add an actual result to #16 using this template; leave unrun checks pending:

```text
Date/timezone:
Release commit and URL:
Device / OS / browser version:
Network (Wi-Fi/mobile data, VPN):
Test project IDs:
Login and Settings:
Estimate and immutable revision:
Production / readiness / collection:
Reload and cross-device persistence:
Keyboard (Firefox) / touch, rotation, native inputs (phone):
Console/network errors or screenshots:
Overall PASS/FAIL and issue links:
```

These browser checks are separate from BO04. The [five-user walkthrough](../ux/usability-test-plan.md) still requires at least four of five first-time users to save an estimate unaided using the [one-page instructions](../ux/user-instructions.md). Record those actual participant results in [usability-results.md](../ux/usability-results.md).
