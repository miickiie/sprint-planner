---
name: Quarterly Cockpit
description: Stakeholder-ready sprint planning timeline synced to Google Sheets.
colors:
  planning-blue: "#2563eb"
  planning-blue-hover: "#1d4ed8"
  timeline-blue: "#3b82f6"
  timeline-blue-stroke: "#1e40af"
  complete-green: "#22c55e"
  complete-green-stroke: "#166534"
  today-red: "#ef4444"
  backlog-amber: "#d97706"
  canvas: "#ffffff"
  app-bg: "#f8fafc"
  grid-line: "#f1f5f9"
  border-subtle: "#e2e8f0"
  text-strong: "#0f172a"
  text: "#1e293b"
  text-muted: "#64748b"
typography:
  headline:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 900
    lineHeight: 1.2
  title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 900
    lineHeight: 1.25
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.4
  label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 900
    lineHeight: 1.2
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  2xl: "24px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.planning-blue}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.planning-blue-hover}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "{colors.app-bg}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
  input-field:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
    padding: "12px 20px"
  planner-card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
    padding: "20px"
---

# Design System: Quarterly Cockpit

## 1. Overview

**Creative North Star: "Collaborative Planning Map"**

Quarterly Cockpit should feel like a working map for tech leads and stakeholders: clear enough to explain in a review, light enough to adjust during planning, and direct enough that the spreadsheet remains the source of truth. The interface serves the task. It should not perform, decorate, or turn sprint planning into a heavy ceremony.

The visual system is restrained product UI: white and slate surfaces, blue for planning actions and timeline focus, green/red/amber only for status, and compact controls that keep the timeline central. Rounded controls and soft elevation make the app approachable, but density stays high because users are comparing dates, quarters, and tasks.

It explicitly rejects the PRODUCT.md anti-references: a heavy enterprise planning suite and a generic Jira clone. New screens should feel like a shared planning canvas, not an issue tracker, report deck, or decorative dashboard.

**Key Characteristics:**
- Compact product density with enough whitespace to scan.
- One primary action color, used sparingly and consistently.
- Timeline-first hierarchy: schedule clarity beats decoration.
- State motion that confirms interaction without slowing planning.
- Familiar controls over invented affordances.

## 2. Colors

The palette is a restrained slate-and-blue product system with semantic status accents.

### Primary
- **Planning Blue**: The primary action and selection color. Use it for create/edit actions, active quarter selection, key timeline emphasis, and the app icon badge.
- **Timeline Blue**: The work-bar fill and focus-support color. Use it inside the planning canvas where the schedule itself needs to stand out.
- **Timeline Blue Stroke**: The darker boundary for timeline bars. Use it to keep blue bars crisp against the white canvas.

### Secondary
- **Complete Green**: Completed work only. Use it for done task bars and success status, never as a decorative accent.
- **Today Red**: The current-date marker and urgent temporal cue. Use it rarely and only when the interface is pointing to time-sensitive context.
- **Backlog Amber**: Unscheduled or missing-plan attention. Use it for backlog badges and schedule gaps, not for general warning decoration.

### Neutral
- **Canvas White**: Main working surface and modal/card background.
- **App Slate**: The quiet shell background for setup, empty, and loading states.
- **Grid Line**: Timeline grid and low-contrast separators.
- **Subtle Border**: Dividers, button borders, input boundaries, and panel edges.
- **Strong Ink**: Primary headings and high-confidence labels.
- **Body Ink**: Dense UI text and task names.
- **Muted Ink**: Secondary labels, helper text, and low-emphasis metadata.

### Named Rules

**The Source-of-Truth Rule.** Blue marks planning intent and current selection; it must not become decorative wallpaper.

**The Status-Only Rule.** Green, red, and amber are semantic. If the color does not describe done, today, or backlog risk, do not use it.

## 3. Typography

**Display Font:** System sans, same family as the rest of the product.
**Body Font:** System sans with platform fallbacks.
**Label/Mono Font:** No separate mono or decorative label font.

**Character:** Product typography is compact, bold, and operational. The app uses weight and spacing to separate hierarchy, not type novelty.

### Hierarchy
- **Headline** (900, 1.25rem, 1.2): Setup screens, modal titles, and main product identity.
- **Title** (900, 1.125rem, 1.25): Toolbar title and compact section labels where the surface needs orientation.
- **Body** (600, 0.875rem, 1.4): Task names, supporting setup copy, and dense product text.
- **Label** (900, 0.75rem, 1.2): Buttons, filters, control labels, status badges, and timeline metadata.

### Named Rules

**The One-Family Rule.** Use one sans family across the app. Do not introduce display fonts, novelty labels, or decorative type pairings.

**The Dense-But-Readable Rule.** Keep labels compact, but never let tiny uppercase text carry essential meaning without nearby context.

## 4. Elevation

Elevation is structural. Most surfaces are flat at rest and separated by border, tonal background, and panel placement. Shadows appear on setup cards, the toolbar, backlog/sidebar overlays, modals, and hoverable cards to clarify stacking and interactivity.

### Shadow Vocabulary
- **Toolbar Low Shadow** (`box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05)`): Use for persistent top surfaces.
- **Card Lift** (`box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)`): Use for setup cards, hoverable backlog cards, and focused panels.
- **Modal Lift** (`box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25)`): Use only for blocking overlays and side panels.
- **Focus Ring** (`0 0 0 3px rgb(59 130 246 / 0.22)`): Use for keyboard-visible focus on controls.

### Named Rules

**The Flat-Until-Needed Rule.** Surfaces stay flat until hierarchy, focus, or overlay depth requires lift.

## 5. Components

### Buttons

Buttons are compact, confident controls for repeated planning actions.

- **Shape:** Gently rounded product controls (`12px`), with pill only for the Today shortcut.
- **Primary:** Planning Blue background, white text, heavy label, `8px 16px` padding, optional soft blue shadow on the strongest action.
- **Hover / Focus:** Hover darkens the blue and lifts by `1px`; focus uses the blue focus ring.
- **Secondary / Ghost:** Slate background or border, muted ink, same radius and typography. Do not invent new button shapes per screen.

### Chips

Chips and badges identify state rather than decorate the interface.

- **Backlog:** Pale amber surface with amber text for missing schedule or unscheduled work.
- **Status:** Green and red are reserved for completed work and today/current-date cues.
- **Shape:** Small rounded rectangles (`6px` to `8px`) with heavy compact labels.

### Cards / Containers

Cards are reserved for framed setup panels, backlog items, modals, and repeated task containers.

- **Corner Style:** Soft rounded corners (`16px` for cards, `24px` for modal panels).
- **Background:** Canvas White, with App Slate only for shell backgrounds and low-emphasis bands.
- **Shadow Strategy:** Flat by default, lifted on hover or overlay.
- **Border:** Subtle Border for structure; no colored side stripes.
- **Internal Padding:** `20px` for backlog cards, `24px` to `32px` for setup and modal panels.

### Inputs / Fields

Inputs should feel sturdy and fast to use.

- **Style:** White background, subtle border, `16px` radius in modal forms, bold body text.
- **Focus:** Blue border plus focus ring. Never rely on color alone without a visible outline.
- **Error / Disabled:** Keep the existing shape and add semantic color only when the app has a real error state to show.

### Navigation

The top toolbar is the primary navigation and control strip.

- **Style:** White surface, bottom border, low shadow, compact grouped controls.
- **Active State:** Blue fill with white text for the active quarter.
- **Hover State:** Slate hover surface for neutral controls; action color only for actions.
- **Mobile Treatment:** Future responsive work should collapse control groups before shrinking text.

### Timeline

The timeline is the signature component.

- **Grid:** Low-contrast slate grid lines; the grid should orient, not dominate.
- **Task Bars:** Planning Blue for active work, Complete Green for done work, and dark strokes for readability.
- **Today Marker:** Red dashed vertical line, used once.
- **Motion:** Dragging may change opacity and position, but the timeline must never animate in a way that obscures dates.

### Modal

Modals are for task definition and editing only when inline editing is not available.

- **Overlay:** Slate scrim with subtle backdrop blur.
- **Panel:** White `24px` rounded panel with modal lift.
- **Actions:** Delete is icon-only red; save is the primary blue action.

## 6. Do's and Don'ts

### Do:
- **Do** keep Quarterly Cockpit fast, focused, and collaborative.
- **Do** use Planning Blue for primary action, active selection, and timeline focus.
- **Do** keep Google Sheets as the implied source of truth in setup, sync, reconnect, and export flows.
- **Do** use state colors only for real status: done, today, backlog, warning, or error.
- **Do** keep controls familiar, keyboard-visible, and quick to scan.
- **Do** preserve reduced-motion behavior for every animation.

### Don't:
- **Don't** make Quarterly Cockpit feel like a heavy enterprise planning suite.
- **Don't** make it look or behave like a generic Jira clone.
- **Don't** bury the timeline under decorative dashboards, hero metrics, or ornamental cards.
- **Don't** use colored side-stripe borders, gradient text, glassmorphism, or full-saturation accents on inactive states.
- **Don't** introduce decorative motion that does not communicate state.
- **Don't** shrink labels or fluid-scale typography until planning controls become hard to read.
