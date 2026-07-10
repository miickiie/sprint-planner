---
target: src/components/SprintPlanner.tsx
total_score: 18
p0_count: 0
p1_count: 3
timestamp: 2026-07-10T06-04-29Z
slug: src-components-sprintplanner-tsx
---
Method: dual-agent (A: 019f4a9b-7dd4-7730-b5f7-4aef81f24e7f; B: 019f4a9b-ab22-7d22-a0d3-da927d2f45d4)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Drag/edit/save actions lack durable sync feedback. |
| 2 | Match System / Real World | 2 | "Sprint Evolution" and "Evolution Status" fight the planning mental model. |
| 3 | User Control and Freedom | 2 | No undo/recovery for drag/date changes; modal has close but no explicit cancel path. |
| 4 | Consistency and Standards | 2 | Toolbar, cards, SVG bars, and modal use different interaction vocabulary. |
| 5 | Error Prevention | 2 | Date/duration constraints exist, but drag-to-date and header mapping remain fragile. |
| 6 | Recognition Rather Than Recall | 2 | Quarter arrows, backlog meaning, and bar drag behavior need interpretation. |
| 7 | Flexibility and Efficiency | 2 | Drag/zoom help, but no bulk edit, shortcuts, or fast review path. |
| 8 | Aesthetic and Minimalist Design | 2 | Toolbar noise competes with the timeline. |
| 9 | Error Recovery | 1 | Async update failures are not recoverable in this surface. |
| 10 | Help and Documentation | 1 | Empty states and controls do not teach the Sheets-backed workflow. |
| **Total** | | **18/40** | **Poor: strong core idea, major UX cleanup needed.** |

## Anti-Patterns Verdict

**LLM assessment**: The timeline concept is solid, but the surface still has AI-product tells: too many tiny uppercase labels, over-equal toolbar actions, vague "Evolution" copy, and a cockpit-like control strip that makes users decode the tool before discussing the plan. It does not fail because it is visually empty; it fails because it is too busy in the wrong places.

**Deterministic scan**: The detector found 28 findings in `src/components/SprintPlanner.tsx`: 3 warnings and 25 advisories. Rules: `design-system-font-size` 22 hits, `gray-on-color` 2, `design-system-color` 2, `overused-font` 1, `design-system-radius` 1. The font-size findings support the critique that the interface relies on many one-off tiny text treatments.

**False positives**: The two `gray-on-color` findings appear to be conditional-class false positives: the blue/white and amber/slate branches are separate UI states, not simultaneous gray text on color.

**Visual overlays**: No reliable user-visible overlay is available for this target. The component is rendered only after Firebase auth, Google Sheets OAuth, a spreadsheet ID, and fetched sheet data. No standalone demo route or mock fixture was found, and using real auth or secret config would be inappropriate for this critique.

## Overall Impression

The best part is the "what / when" split: a task list beside a sprint timeline is exactly the right skeleton for stakeholder review. The largest opportunity is to make the timeline the main story. Right now the toolbar, copy, and modal flow make Sprint Planner feel like a control panel instead of a collaborative planning map.

## What's Working

- The two-pane structure gives stakeholders a readable task-versus-time model.
- Timeline primitives are directionally right: month headers, sprint grid, task bars, done bars, today marker, and print export.
- The visible "Open Sheet" path reinforces Google Sheets as the source of truth, even though its green styling conflicts with the design system.

## Priority Issues

**[P1] The primary planning story is buried under toolbar noise.** The toolbar exposes quarter controls, status, zoom, CSV, PDF, sheet, add task, backlog, and today as peer actions. This creates 8+ decision points before the user reaches the schedule.

**Why it matters**: Stakeholders need to understand plan, timing, and risk quickly; the control strip competes with that goal.

**Fix**: Group exports and zoom as secondary utilities, make Add Task and Sheets sync/source state the primary action pair, and give the active quarter a clearer page title.

**Suggested command**: `/impeccable distill src/components/SprintPlanner.tsx`

**[P1] Terminology undermines trust.** "Sprint Evolution," "Define New Task," "SAVE EVOLUTION," and "Evolution Status" sound generated and vague for an engineering planning tool.

**Why it matters**: Engineering managers and tech leads need language that maps to planning conversations, not branded abstraction.

**Fix**: Replace with direct labels: "Sprint Plan," "Add task," "Save task," "Status," "Unscheduled work."

**Suggested command**: `/impeccable clarify src/components/SprintPlanner.tsx`

**[P1] Critical changes lack reassurance.** Dragging a timeline bar updates dates immediately, and saving closes the modal without visible confirmation or local recovery.

**Why it matters**: The app is editing the source-of-truth sheet. Users need sync confidence and a way back from mistakes.

**Fix**: Add visible "Synced to Sheets" / "Saving" / "Failed to sync" states, undo for recent date/order changes, and inline recovery when a sheet write fails.

**Suggested command**: `/impeccable harden src/components/SprintPlanner.tsx`

**[P2] Accessibility and interaction semantics are uneven.** Some controls have labels, but key interactions are SVG bars, clickable divs, hover-revealed edit icons, and color-coded states.

**Why it matters**: Even for an internal tool, keyboard-only and screen-reader users will struggle with planning edits and timeline inspection.

**Fix**: Use semantic buttons for edit/backlog cards, add visible keyboard focus beyond shadows, support Esc modal close, and provide accessible alternatives for drag actions.

**Suggested command**: `/impeccable audit src/components/SprintPlanner.tsx`

**[P2] Visual system drifts from its own rules.** Green is used for "OPEN SHEET," but `DESIGN.md` reserves green for completed work. The detector also found many font-size one-offs.

**Why it matters**: The design system says status color should be semantic. Breaking that rule weakens stakeholder trust in color meaning.

**Fix**: Reserve green for done/success, style Sheets access as neutral or blue source-state, reduce tiny uppercase micro-labels, and normalize text sizes.

**Suggested command**: `/impeccable polish src/components/SprintPlanner.tsx`

## Persona Red Flags

**Alex, power user**: No visible keyboard shortcuts, bulk edit, bulk schedule shift, or command path. Every task edit routes through a modal, and toolbar actions compete instead of supporting a fast planning loop.

**Sam, accessibility-dependent user**: SVG bars, clickable backlog divs, hover-revealed edit icons, and color-coded done/today states create keyboard and screen-reader risk.

**Riley, stress tester**: Long task names are truncated, header indexes can become fragile when sheet columns are unexpected, and async failures can leave the UI looking saved when the source of truth is not.

**Tech Lead / Stakeholder**: The view shows a schedule grid, but does not summarize risk, unscheduled impact, changed dates, or sync confidence. It is not yet a review narrative.

## Minor Observations

- "No tasks scheduled" should explain whether the quarter, filter, or missing dates caused the empty state.
- "Priority Backlog" and "Unscheduled Items" split one concept into two labels.
- The modal is visually polished but too ceremonial for frequent task edits.
- The print export appears important to stakeholder communication, but it is hidden behind the same weight as CSV and other toolbar actions.

## Questions to Consider

1. Should this screen optimize first for planning edits by tech leads, or stakeholder review readout?
2. What should a stakeholder understand in the first 10 seconds: quarter scope, delivery risk, or task sequence?
3. Should Google Sheets feel like an external escape hatch, or should sync/source state be part of the main planner header?
4. Are unscheduled items true backlog, missing data, or schedule risk?
