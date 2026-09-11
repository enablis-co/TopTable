# Handoff: Top Table — app shell redesign ("Lit canvas")

## Overview

Top Table is a wedding seating-plan tool. An app already exists and works; this handoff is a **visual and structural refresh of the app shell** — top bar, left rail, plan screen, floorplan, violations panel and unseated strip. Layout and information architecture are unchanged from the current build. What changes is the craft: chrome goes dark so the room is the only bright thing on screen, all figures move to monospace, and floorplan tables gain four distinct materials so occupancy reads before any label does.

The direction is called **Lit canvas** (it was option `1a` of three explored).

### What problem this solves

The current build reads as a 2012 admin panel for three reasons, and every rule below is aimed at one of them:

1. **Everything sits on one plane.** The v1 style guide banned shadows and gave nothing back, so there was no second plane anywhere. Fixed by splitting the app into dark chrome and a light canvas — depth from value contrast, still no shadows.
2. **Everything weighs the same.** Two weights across a 12–22px range with one near-black accent. Fixed by widening the range: a 38px monospace figure next to an 11px label.
3. **The room looks like a diagram.** Unfilled 1.6px circles on the page background. Fixed by giving tables four materials — empty, filling, full, in violation — and putting them on a white floor.

## About the design files

The files in this bundle are **design references created in HTML**. They are prototypes of the intended look, not production code to copy. Recreate them in the existing codebase using its established framework, component patterns and styling approach. Do not lift the inline styles out of the reference file; use `tokens.css` (or translate it into whatever token mechanism the codebase already uses) and build real components.

| File | What it is |
| --- | --- |
| `reference-1a-plan-screen.html` | The plan screen at 1180 × 756. Open in a browser. This is the target. |
| `tokens.css` | Every colour, radius, spacing step and type style, as CSS custom properties. Drop-in. |
| `v1-style-guide.html` | The original style guide. Still authoritative on voice, severity semantics and the mark. Its colour and type sections are superseded by `tokens.css`. |

## Fidelity

**High fidelity.** Colours, type sizes, spacing and radii in this document are final and exact. Match them. Where the reference file and this document disagree, this document wins.

## Design tokens

Use `tokens.css`. Summary of what is new or changed versus the v1 style guide:

- **NEW — a chrome surface scale.** `--chrome` `#151D26` through `--chrome-ink-faint` `#6E7D8C`. The top bar and left rail live here. Nothing else does.
- **NEW — IBM Plex Mono for every figure.** Replaces `font-variant-numeric: tabular-nums` on Plex Sans. Any number that can change is monospace: capacity, seat counts, table fills, nav counts, timestamps, severity readouts.
- **NEW — `--t-figure-xl`, 38px/500 mono at −1.5px tracking.** The capacity headline. This is the largest thing on the screen and the main answer to flat hierarchy.
- **CHANGED — control radius 4px → 5px**, and a new `--r-frame` 14px used only on the outer app frame.
- **NEW — `--surface-edge` `#E4E0D7`**, a slightly warmer border for a white surface sitting on `--paper`. `--rule` remains correct for dividers *inside* a surface.
- **Unchanged and still binding:** the 4/8/12/16/18/22/26/32/48 spacing scale, no shadows anywhere, no success colour, severity carried by shape as well as colour, sentence case everywhere, the mark never recoloured to carry state.

## The rules

These are the constraints a reviewer will check against. They matter more than any single measurement.

**1. Two zones, and they never mix.** Chrome (top bar, left rail) is dark. Canvas (everything right of the rail and below the bar) is light. A component belongs to exactly one zone and uses that zone's ink scale. Never put a `--paper` card inside chrome; never put a `--chrome` fill on the canvas.

**2. One primary action per view.** On the plan screen it is Auto-allocate. Because it sits on dark chrome it inverts: `--chrome-ink` background at `#F0EDE6`, `--chrome` text. On the canvas the primary would be `--slate` fill with white text. Nothing else on screen may be filled.

**3. No shadows. No gradients. No blur.** Separation comes from value contrast (chrome against canvas) and 1px borders. If two things aren't separating, the answer is a border or a background step, never a shadow.

**4. Every changing number is monospace.** If the value can differ between two renders, it is `--font-mono`. Static labels stay Plex Sans. This is why the columns stop jittering as a plan is edited.

**5. Severity is shape first, colour second.** Hard: 3px solid left bar in `--hard` on `--hard-wash`. Soft: same bar in `--soft` on `--soft-wash`. Pinned guest: filled 6px `--slate` dot. Table in violation: dashed outline. Desaturate the whole screen and it must still read — this is a projector requirement, not an accessibility footnote.

**6. There is no success state.** No green, no ticks. A plan with nothing wrong says so in words: "One hard violation stops this plan publishing" becomes "Nothing is blocking this plan."

**7. Sentence case, active voice, no exclamation marks.** An action keeps its name through the whole flow: the button that says Auto-allocate produces a state that says allocated. Placeholders are a real example of valid input, never a repeat of the label.

**8. The floorplan is drawn from config.** Small and cosy renders five tables, celebrity scale renders twenty-seven. Geometry scales; stroke weights and label sizes do not shrink below the minimums in the floorplan section.

## Screen: Plan

**Purpose.** The main working screen. The couple or planner sees whether there are enough seats, drags names onto tables, and reads what is broken.

**Frame.** `--r-frame` 14px, `1px solid var(--chrome-edge)`, `overflow: hidden`, `background: var(--chrome)`. Reference size 1180 × 756; in the app it fills the viewport.

**Layout.** Column: a 54px top bar, then a row that fills the rest.

```
┌───────────────────────────────────────────────────────────────┐
│ top bar  54px   dark chrome                                   │
├──────────┬────────────────────────────────────┬───────────────┤
│ rail     │ canvas                             │ side panel    │
│ 192px    │ flex:1, min-width:0                │ 300px         │
│ dark     │   header      (auto)               │ white         │
│          │   floorplan   (flex:1)             │ 1px left rule │
│          │   unseated    (auto)               │               │
└──────────┴────────────────────────────────────┴───────────────┘
```

Rail and side panel are `flex: none`. The canvas column is `flex: 1; min-width: 0` so the floorplan shrinks rather than pushing the panel off screen.

### Top bar

54px tall, `flex: none`, `display:flex; align-items:center; gap:20px; padding:0 18px`, `border-bottom: 1px solid var(--chrome-rule)`.

Left to right:

- **Mark + wordmark.** 22px mark in `--chrome-ink`, 10px gap, wordmark 15px/500 at `--tracking-wordmark` in `--chrome-ink`. Stroke weight on the mark is 2.2 at 22px (v1 rule: 1.8 at 40px, 2.2 at 24px, 2.6 at 16px).
- **Divider.** 1px × 22px in `--chrome-line`.
- **Event name** 13px in `--chrome-ink-muted`, then the **scenario pill**: 11px mono in `--chrome-ink-dim`, `--chrome-raised` fill, `1px solid var(--chrome-line)`, `--r-pill`, padding 2px 7px. Copy is the scenario name in sentence case: "small and cosy".
- **`margin-left: auto`**, then three actions with a 10px gap:
  - *Change scenario* — text only, 13px `--chrome-ink-dim`, no border, padding 7px 4px.
  - *Add guest* — 13px `--chrome-ink-muted`, transparent fill, `1px solid var(--chrome-border)`, `--r-control`, padding 7px 13px.
  - *Auto-allocate* — 13px/500, `#F0EDE6` fill, `--chrome` text, no border, `--r-control`, padding 8px 15px.

**States.** Ghost button hover: text to `--chrome-ink-muted`. Secondary hover: border `--chrome-ink-faint`, fill `--chrome-raised`. Primary hover: fill `#FFFFFF`. Focus-visible everywhere: `2px solid #8FA0B2` with 2px offset on chrome, `2px solid var(--slate)` on canvas.

### Left rail

192px, `flex: none`, `display:flex; flex-direction:column; padding:16px 10px; gap:2px`.

- **Section label** "Wedding", 11px `--chrome-ink-faint`, padding `4px 10px 8px`.
- **Nav rows**, padding 8px 11px, `--r-nav`. Items: Plan, Guests, Tables, Rules, Catering.
  - *Active:* `--chrome-active` fill, `--chrome-ink` text, 13px/500, and a 5px `--chrome-ink` dot on the left with a 10px gap.
  - *Inactive:* transparent, `--chrome-ink-dim`, 13px/400.
  - *Hover:* `--chrome-raised` fill.
  - **Counts** sit right-aligned via `justify-content: space-between`: 11px mono in `--chrome-ink-faint`. Plan has none; Guests 70, Tables 9, Rules 1; Catering has none. A zero count is shown, not hidden.
- **Footer**, `margin-top: auto`, `padding: 12px 11px`, `border-top: 1px solid var(--chrome-rule)`. Label "Last saved" 11px `--chrome-ink-faint`, value 11px mono `--chrome-ink-dim`.

### Canvas header

`flex: none`, `padding: 22px 26px 18px`, `border-bottom: 1px solid var(--rule)`, `display:flex; align-items:flex-end; justify-content:space-between`, on `--paper`.

**Capacity readout — the most-read component in the app.** A baseline-aligned row with a 12px gap, alternating mono figures and sans words:

> **78** seats for **70** guests

Figures are `--t-figure-xl` (38px/500 mono, −1.5px tracking, line-height 1). Words are 16px/400 Plex Sans in `--ink`. Below, 8px down: 12px `--ink-muted`, the qualifier then the composition, separated by a middot — "Eight spare · 9 × 8, plus a top table of 6".

Three qualifier states, all calm. Short is a warning, and it blocks nothing:

| State | Qualifier copy | Treatment |
| --- | --- | --- |
| Spare seats | "Eight spare" | `--ink-muted` |
| Exact | "Exactly enough" | `--ink-muted` |
| Short | "Eight short" | `--soft-deep` |

**Stat pair**, right-aligned, 26px gap, `padding-bottom: 4px`: value `--t-figure-lg` (20px/500 mono) over label 11px `--ink-muted`. Pinned, then unseated.

### Floorplan

Container: `flex: 1; min-height: 0; padding: 18px 22px`. Inside, a full-height `--surface` panel, `1px solid var(--surface-edge)`, `--r-card`, 10px padding. The SVG fills it: `viewBox="0 0 760 430"`, `width:100%; height:100%; display:block`.

**Top table.** Rounded rect, `rx=9`, 220 × 46, `--slate` fill, centred. Label 13px/500 Plex Sans in white, centred: "Top table · 6 of 6".

**Round tables.** Two rows of four, radius 34, centres at x = 120 / 293 / 466 / 639 and y = 172 / 330. Each table is three or four elements:

1. **Seat ring** — a circle at r = 43, `fill: none`, `stroke-width: 7`, `stroke-dasharray: "7 26.8"`. The dashes *are* the seats. For n seats at radius r the period is `2πr / n`; keep the dash at 7 and set the gap to `period − 7`. At r = 43, n = 8 that is 33.8 − 7 = 26.8.
2. **Table body** — circle at r = 34.
3. **Number** — 15px/500 mono, centred, 2px above centre (`y = cy − 2`).
4. **Fill count** — 10px mono, centred, 14px below centre. Format "8 of 8", never a fraction or a percentage.

**Four materials.** This is the core of the redesign. Do not collapse them.

| State | Seat ring | Body fill | Body stroke | Number | Count |
| --- | --- | --- | --- | --- | --- |
| Empty | `--rule-strong` | `--surface` | 1.5px `--rule` | `--ink-faint` | `--ink-faint` |
| Filling | `--rule-strong` | `--sunken` | 1.5px `--rule-strong` | `--ink` | `--ink-muted` |
| Full | `--slate` | `--slate` | none | `#FFFFFF` | `--chrome-ink-dim` |
| In violation | `--hard` | `--hard-wash` | 1.8px `--hard`, `stroke-dasharray: "6 4"` | `--hard-deep` | `--hard`, weight 500 |

In violation wins over full. The count on a violating table shows the real overflow: "9 of 8".

**Pinned marker.** A filled 3.6px circle inside the table's upper-right quadrant, at `(cx + 19, cy − 19)`. Keep it fully within the body — an offset of magnitude 34 or more straddles the r = 34 edge and the dot stops reading as a dot. Present if any guest at that table was placed by hand. One marker per table, not one per pinned guest. It is `--slate` on the empty, filling and in-violation materials, and `#FFFFFF` on the full material — slate on a slate body would be invisible, and a full table is exactly where pins matter most.

**Scaling.** Twenty-seven tables at this radius will not fit 760 × 430. Grow the viewBox and lay out on a grid with a 173px column pitch and a 158px row pitch; keep table radius at 34 and let the SVG scale down to fit. Floor at a rendered radius of 22px — below that, drop the fill count and keep only the number.

### Unseated strip

`flex: none`, `border-top: 1px solid var(--rule)`, `padding: 12px 26px 14px`, column with a 9px gap.

- **Header row**, baseline aligned, 10px gap: "Unseated" 13px/500, count 12px mono `--ink-muted`, then `margin-left: auto` and a 12px `--ink-faint` hint — "Drag onto a table, or auto-allocate".
- **Chip run.** A `flex: 1; min-width: 0` scrolling row (`overflow-x: auto`, `flex-wrap: nowrap`, 7px gap) with the overflow count pinned outside it as `flex: none`. Getting this wrong clips the count, which is the payload.
- **Chip.** 12px, `--surface` fill, `1px solid var(--rule-strong)`, `--r-control`, padding 5px 10px, `white-space: nowrap`. Draggable. Grab cursor on hover, border to `--slate`.

### Side panel

300px, `flex: none`, `--surface`, `border-left: 1px solid var(--rule)`, column.

**Violations block.** `padding: 18px 20px 14px`, `border-bottom: 1px solid var(--rule)`.

- Header row, baseline, space-between: "Violations" 15px/500; rule count 11px `--ink-faint` — "1 rule registered".
- Each violation: `border-left: 3px solid`, wash background, `padding: 9px 12px`, 7px bottom gap. Title 13px Plex Sans in `--ink`. Meta 11px mono, 2px below, in `--hard-deep` or `--soft-deep`, formatted "Hard · 9 of 8" / "Soft · partners".
- Hard before soft, always. Within a severity, table order.
- Footer line 12px `--ink-muted`, 12px above: "One hard violation stops this plan publishing." Pluralise honestly. With no hard violations: "Nothing is blocking this plan." With nothing at all: "No violations." No green, no tick.

**Table detail.** `padding: 18px 20px`, column, 11px gap. Shows the selected table; defaults to the first violating table.

- Title 15px/500 — "Table 8".
- Guest rows: `padding: 7px 0`, `border-bottom: 1px solid var(--sunken)`, space-between. Name 13px. Right side is a 6px filled `--slate` dot if pinned, else "auto" in 11px `--ink-faint`. Last row has no border. Beyond five guests, an `--ink-muted` row reads "and five more".
- Needs block: `--sunken` fill, `--r-nav`, `padding: 10px 12px`. Label "Needs at this table" 11px `--ink-muted`, value 13px `--ink` — "1 step-free, 1 nut allergy". Dietary preferences are **not** a guest-list column; they are a catering count and appear here and in the guest form only. Omit the block entirely when there are no needs.

## Interactions and behaviour

- **Drag a guest onto a table.** Dragging from the unseated strip or between tables. On drag start, valid tables lift their seat-ring stroke to `--slate`; a table that would go over capacity lifts to `--hard`. Drop pins the guest in that seat. Transitions 120ms ease-out on stroke and fill only.
- **Pinning.** A guest placed by hand is pinned and Auto-allocate will not move them. Unpin from the table detail row.
- **Auto-allocate.** Fills unpinned seats. On completion the state reads *allocated* — the button label and the resulting copy use the same word. Show the diff as counts in the header rather than an animation across the floorplan.
- **Violations recompute on every move**, synchronously. The panel is the source of truth; the dashed table outline is its echo.
- **Selecting a table** loads it into the table detail. Selected table: seat ring stroke-width 7 → 9. No other selection treatment.
- **Live validation.** Never a modal, never a toast. Violations appear in the panel and on the table. Saving is implicit; the rail footer timestamp is the confirmation. "Saved", not "Successfully saved!".
- **Publishing** is blocked while any hard violation exists. The block is stated in the panel footer, and the publish control is disabled with that same sentence as its reason.
- **Responsive.** Below roughly 1100px, the side panel becomes a right-hand slide-over over the canvas (`--r-card`, `--surface`, `1px solid var(--rule)`) triggered from the violations count. Below roughly 820px the rail collapses to icons at 56px. The floorplan never gets a horizontal scrollbar; it scales.

## State

| State | Shape | Notes |
| --- | --- | --- |
| `scenario` | name, tableCount, seatsPerTable, topTableSeats | Drives floorplan geometry and the capacity readout |
| `guests[]` | id, name, side, role, tags[], needs | Reaches 200; the guest list must virtualise |
| `seating` | map of tableId → guestId[] | |
| `pinned` | Set of guestId | Placed by hand; Auto-allocate skips these |
| `rules[]` | id, kind, severity: hard \| soft, subjects[] | |
| `violations[]` | Derived, never stored | Recomputed from seating + rules on every change |
| `selectedTableId` | Defaults to the first violating table | |
| `lastSavedAt` | Rail footer | |

Capacity, seated, unseated, pinned counts and per-table fills are all derived. Do not keep them in state; they are the numbers that jitter when they are cached.

## Assets

None beyond the mark, which is four vector primitives (one rounded rect, three circles) and is reproduced inline in the reference file at 22px. No images, no icon library, no illustrations. Type is IBM Plex Sans and IBM Plex Mono from Google Fonts, weights 400/500 only — nothing heavier.

## Not covered by this handoff

The guest list, guest detail, scenario setup, first-run and rules screens were not redesigned. The tokens and rules above apply to them, but their layouts are unspecified. Two known problems worth raising before they are built: the guest list currently reads as a spreadsheet at 200 rows, and the empty and first-run states are unresolved. The v1 style guide's line still holds — an empty screen is an invitation, not an apology: "Start from a scenario, or add your first guest".
