# Usability test plan

## Why

The study sets one ease-of-use target (BO04, §1.4): **at least four of five first-time users shall create and save an estimate using one page of instructions, without assistance.** NFR02 and NFR03 add field-level errors, keyboard use and phone layouts. This plan turns those into a repeatable test. It runs during the customer walkthrough (#16) and again after any change to the estimate flow.

## Participants

- Five people who have not used BlockCalc, matching the User profile in §3.1: plans block production, basic browser skills.
- At least two sessions on a phone (360–412 px wide) and two on a desktop browser.
- No one from the Almo Team.

## Setup

- Frontend in mock mode on a fresh browser profile, so storage is empty; or staging once the backend is live (#15).
- Hand each participant the [one-page instructions](user-instructions.md) and the task card below. Nothing else.
- One facilitator who reads the script and does not help; one note-taker. Record the screen with consent.

## Tasks

| # | Task card wording | Success when | Requirements |
|---|---|---|---|
| T1 | "Enter these prices, weights, molds and yields." (card lists the §8.5 values) | Settings saved, readiness summary shows complete | FR01–FR06 |
| T2 | "Create a project for 1700 full and 300 half blocks with Mix 2 and save its cost." | Project saved with revision 1 at 691.20 RUB | FR07–FR15, **BO04** |
| T3 | "When will this order be ready?" | Participant reads 1632 h / 68 days or the date | FR19 |
| T4 | "The first run went into the molds yesterday morning. Record that." | Run 1 started with an edited start time | FR22 |
| T5 | "Find all projects that are still drafts." | Status filter set to Draft | FR27 |

T2 is the BO04 task. The others show where the flow is unclear.

## Measures

| Measure | How | Target |
|---|---|---|
| T2 completion without assistance | Facilitator gives no help; any hint counts as failure | ≥ 4 of 5 (BO04) |
| Time on T2 | From reading the card to the saved summary | Recorded; no target in the first release |
| Errors | Each validation message seen or wrong path taken | Recorded with the screen |
| Ease rating | Single Ease Question (1–7) after each task | Median ≥ 5 |
| Overall | System Usability Scale (10 items) at the end | ≥ 68 (industry average) |

## Script

1. "We are testing the software, not you. Please think aloud."
2. Hand over the instructions; give one minute to read them.
3. Read each task card. Stop a task at 5 minutes, or when the participant says they are done or stuck.
4. After each task, ask the Single Ease Question. At the end, run the SUS questionnaire.
5. Debrief: "What was the most confusing moment?"

## After the sessions

Record the results in [usability-results.md](usability-results.md). Each problem becomes a GitHub issue labelled `frontend` and `accessibility` where relevant, rated by severity:

| Severity | Meaning |
|---|---|
| 4 Blocker | Prevented T2 for any participant |
| 3 Major | Caused a long delay or a wrong saved value |
| 2 Minor | Hesitation or a recoverable error |
| 1 Cosmetic | Comment only |

Release (#16) needs BO04 met and no open severity-4 or severity-3 issues.
