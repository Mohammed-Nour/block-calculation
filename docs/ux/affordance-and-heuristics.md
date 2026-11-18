# Affordance and heuristic review

The study measures ease of use (BO04, NFR02, NFR03) but says nothing about *how* the interface should make actions obvious. This review fills that gap with two lenses:

- **Affordances and signifiers** (Norman): every control looks like what it does, and its state is visible.
- **Nielsen's 10 usability heuristics**, applied screen by screen.

Status: ✅ in place · 🔧 fixed during the #13 browser pass · ⏳ open.

## Interface-wide rules

| Rule | How BlockCalc meets it | Status |
|---|---|---|
| Buttons look pressable; links look like links | Filled or outlined `Button` for actions; underlined or coloured `Link` for navigation. ESLint bans raw `<button>`/`<input>` so every control carries the same styling and focus ring | ✅ |
| Disabled controls say why | A disabled control is always paired with text explaining what unlocks it ("Save an estimate first…", "I checked the blocks…") | ✅ |
| Required inputs are marked | Asterisk on the label plus `required`; units sit beside the input | ✅ |
| Errors sit at the field | Message under the input, `aria-invalid`, linked with `aria-describedby`; a form-level summary says nothing was saved | ✅ |
| Destructive or irreversible actions confirm | Cancel project, zero price, re-pricing and readiness use a dialog naming the consequence; focus starts on the safe choice | ✅ |
| System status is visible | Loading skeleton, "Saving…" labels, success messages, status badges with words (not colour alone) | 🔧 skeleton added |
| Keyboard and focus | Skip link, visible focus ring, radio group with arrow keys, dialogs trap focus and close with Escape | ✅ |
| Phone layout | Single column at 360 px, cards instead of wide tables, no sideways scroll | 🔧 estimate table |

## Screen by screen

### Settings

| Heuristic | Observation | Status |
|---|---|---|
| Match with the real world | Fields use the planner's units: RUB per ton, kg per wheelbarrow, blocks per batch | ✅ |
| Help users recognise errors | "Enter a price of 0 or more, e.g. 10.50" instead of "Invalid" | ✅ |
| Error prevention | A zero price asks for confirmation; Mix 1 users are told stone is not needed | ✅ |
| Visibility of status | Readiness box lists exactly what blocks costing | ✅ |

### New project

| Heuristic | Observation | Status |
|---|---|---|
| Recognition rather than recall | Each mix card shows its recipe and yields, so the User does not have to remember them | ✅ |
| Error prevention | Changing quantities or the mix clears a stale cost preview (FR08) | ✅ |
| Help users recover | No mix → message beside the picker and focus moves there; missing settings → listed with a link to Settings | 🔧 focus |
| Visibility of status | The save button says what it will save: "Save draft" or "Save project and estimate" | ✅ |

### Project summary

| Heuristic | Observation | Status |
|---|---|---|
| Consistency | Every section is a card with the same heading, description and action placement | ✅ |
| Minimalist design | A long plan shows only runs needing action; the rest are in a disclosure | 🔧 |
| User control | Edit order only while editable, otherwise a sentence explains the lock (FR18) | ✅ |
| Error prevention | Start appears only on the next run that can use free molds; Confirm ready needs the physical check | ✅ |

### Projects list

| Heuristic | Observation | Status |
|---|---|---|
| Visibility of status | Status badges use words and colour | ✅ |
| Flexibility | The filter lives in the URL, so a filtered list can be bookmarked | ✅ |
| Help and documentation | The empty list explains why it is empty and links to New project | ✅ |

## Open items

| Item | Why | Issue |
|---|---|---|
| Validate with five first-time users | BO04 can only be met by testing | #16 |
| Firefox and phone browser pass | NFR08 | #16 |
| Automated axe scan in CI | Catch contrast and ARIA regressions | follow-up |
