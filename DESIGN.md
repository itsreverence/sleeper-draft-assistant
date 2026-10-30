---
name: Sleeper Draft Assistant
description: A focused, local-first AI fantasy football draft and team-management workspace.
colors:
  background: "#0b0d10"
  surface: "#14171c"
  surface-raised: "#1b1f26"
  surface-sunken: "#0e1013"
  surface-hover: "#20242c"
  border: "#262b33"
  border-strong: "#454c58"
  border-input: "#626c7c"
  text-primary: "#f2f4f6"
  text-secondary: "#aab0ba"
  text-muted: "#929aa6"
  accent: "#34d399"
  accent-strong: "#10b981"
  info: "#8b9bf8"
  warning: "#f5b544"
  danger: "#f87171"
  pos-qb: "#f5b544"
  pos-rb: "#34d399"
  pos-wr: "#38bdf8"
  pos-te: "#a78bfa"
  pos-k: "#f472b6"
  pos-def: "#94a3b8"
  board-head: "#181c22"
  board-cell: "#101318"
  board-user: "#14251f"
  board-user-pick: "#17382d"
  board-current: "#2a2112"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.35
  subtitle:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  secondary:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  meta:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.06em"
rounded:
  sm: "6px"
  md: "10px"
  lg: "16px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  3xl: "32px"
  4xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#04160e"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-secondary:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: "20px"
  input:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
---

# Design System: Sleeper Draft Assistant

## Overview

**Creative North Star: "The Focused Draft Room"**

This is an operational tool used while a manager is making time-sensitive decisions. The interface should feel like a quiet, well-organized draft room: the current state is easy to scan, the next useful action is obvious, and deeper reasoning is available without competing with the decision itself.

The system is dark, restrained, and information-dense. Tonal surfaces, compact borders, semantic status colors, and progressive disclosure create hierarchy without decorative noise. AI features may feel distinct through the indigo information accent, but they remain part of the same working environment rather than a separate chat product.

**Key Characteristics:**

- Focused and scan-friendly
- Dark operational surfaces with restrained elevation
- Green readiness and primary-action accent
- Indigo AI and informational emphasis
- Progressive disclosure for evidence, strategy, and history

## Colors

The palette uses a near-black foundation with neutral charcoal surfaces and a small set of semantic accents. Green means ready or primary action, indigo means AI or informational context, amber means caution, and red means a blocking or destructive state.

### Primary

- **Readiness Green** (#34d399): Primary actions, successful setup state, user picks, and confirmed readiness.
- **Strong Readiness Green** (#10b981): Hover and pressed emphasis for primary actions.

### Secondary

- **AI Indigo** (#8b9bf8): AI provider state, informational highlights, and neutral assistant emphasis.

### Tertiary

- **Warning Amber** (#f5b544): Stale data, considerations, sync degradation, and attention-required states.
- **Danger Red** (#f87171): Errors, exclusions, and destructive actions.

### Neutral

- **Near-black Background** (#0b0d10): Global page foundation.
- **Panel Surface** (#14171c): Primary application panels.
- **Raised Surface** (#1b1f26): Secondary controls and elevated content.
- **Sunken Surface** (#0e1013): Inputs, board cells, and recessed content.
- **Primary Text** (#f2f4f6): Headings and high-priority values.
- **Secondary Text** (#aab0ba): Explanations and supporting content.
- **Muted Text** (#929aa6): Labels, metadata, and low-priority status text. This is the shipped value; 6.3:1 on the panel surface.
- **Strong Border** (#454c58): Secondary buttons, pills, callouts, and scrollbars. Structural, not a contrast target.
- **Input Border** (#626c7c): Field edges. At least 3:1 against the panel, raised, and sunken surfaces (WCAG 1.4.11).

### Position

Six `--pos-*` tokens (QB amber, RB green, WR sky, TE violet, K pink, DEF slate) drive the draft-board stripe and position chips, and nothing else.

### Draft board

`--board-head`, `--board-cell`, `--board-user`, `--board-user-pick`, and `--board-current` are the board-only surfaces for headers, cells, the user's column, the user's picks, and the cell on the clock.

### Named Rules

**The Semantic Accent Rule.** Accent colors communicate state or action. Do not use them as decoration or apply them uniformly to every surface. Green only for actions and "ready"; numeric data is primary text; missing data is muted text with a reason; amber for anything that changes a lineup decision; red only for out, IR, and destructive actions.

**The Token Rule.** Literal hex colors live only in `apps/web/src/lib/theme.css`. Component styles reference tokens; `apps/web/src/styles.test.ts` fails the build otherwise.

## Typography

**Display Font:** Inter (with ui-sans-serif, system-ui, sans-serif fallbacks)

**Body Font:** Inter (with ui-sans-serif, system-ui, sans-serif fallbacks)

**Character:** Compact, neutral, and highly legible at small sizes. Weight and color carry hierarchy more often than oversized type.

### Hierarchy

Tokens live in `theme.css`. Weights are 400, 500, 600, and 700 only; nothing heavier ships.

| Token | Size / line | Weight | Use |
|---|---|---|---|
| `--text-xs` | 11px / 1.3 | 600, 0.06em, uppercase | Eyebrows and column heads only |
| `--text-sm` | 12px / 1.4 | 500 (600 in chips and pills) | Metadata, chips, pills, legends, field labels |
| `--text-md` | 13px / 1.45 | 400 | Secondary copy and table cells |
| `--text-base` | 14px / 1.5 | 400 (600 in buttons) | Body, inputs, buttons |
| `--text-lg` | 16px / 1.4 | 600 | Panel titles and player names in cards |
| `--text-xl` | 18px / 1.35 | 600 | Drawer and dialog titles |
| `--text-2xl` | 22px / 1.2 | 700, -0.01em | Page title in the top bar |
| `--text-3xl` | 28px / 1.15 | 700, -0.015em | The decision headline only |

The uppercase label style is reserved for section eyebrows and table column heads. Chips, pills, tags, status text, and buttons are sentence case. Use tabular numerals on pick numbers, projections, ranks, and counts.

### Named Rules

**The Decision-First Type Rule.** Use the largest weight and contrast for the current decision or state, not for secondary evidence or settings chrome.

## Layout

The application uses a centered responsive shell with a constrained content column. Connected workflows are top-anchored so the board and working panels remain immediately available. The pre-connect state may use a narrower centered column to keep the entry task deliberate.

The draft room leads with the decision. A pick strip sits under the top bar, then the Assistant call (7/12) beside recent picks and the roster summary (5/12), then a two-round live board, then the Ask Assistant command bar. Emergency board-only mode and a completed draft put the board directly under their note instead, with recent picks and the roster below it. At 1100px and below the room is one column in the same order. The board scrolls horizontally when team count exceeds the viewport, and it keeps the round column and team header legible.

Spacing follows the 4px base scale: `--space-N` is 4N pixels, with tokens for 4, 8, 12, 16, 20, 24, 32, and 40. Panel padding is 20px on desktop and 16px at the compact breakpoint. List rows are 44px. Group related controls tightly and use a full divider or larger gap before a separate workflow.

Breakpoints are literal in media queries because custom properties cannot drive them: two-column collapse at 1100px, compact at 760px, and phone at 520px. The style guard rejects any other width.

## Elevation & Depth

Depth is primarily tonal: near-black backgrounds, sunken inputs, raised controls, and panel surfaces establish the hierarchy. Small neutral shadows support panels and popovers without making the interface feel glossy. Borders are structural and remain subtle at rest.

### Shadow Vocabulary

- **Low panel shadow** (`0 1px 2px rgba(0, 0, 0, 0.45)`): Default application panels.
- **Medium shadow** (`0 10px 28px -12px rgba(0, 0, 0, 0.55)`): Popovers and meaningful raised surfaces.
- **Large shadow** (`0 28px 56px -20px rgba(0, 0, 0, 0.65)`): Modal or dialog surfaces only.

### Named Rules

**The Tonal Layering Rule.** Prefer surface and border changes over ornamental glow. Elevation should explain containment or focus.

## Shapes

The form language is restrained rounded rectangles with 6px controls, 10px fields and buttons, and 16px primary panels. Pills are reserved for compact status and confidence labels. Borders are 1px and semantic; avoid nested card shells and excessive rounded containers.

## Components

### Buttons

- **Shape:** 10px radius for standard buttons; 6px for compact controls.
- **Primary:** Readiness green with dark text, 10px 16px padding, used for the next clear action.
- **Secondary:** Raised charcoal surface with a strong neutral border.
- **Ghost / text:** Transparent, muted text for disclosures, alternate paths, and low-frequency actions.
- **Hover / Focus:** Small surface or border shift; use the shared green focus ring and preserve keyboard visibility.

### Chips

- **Style:** Small pill with semantic border and soft tint, 12px at weight 600, sentence case.
- **State:** Use for confidence, setup readiness, warnings, AI provider state, and compact counts. Do not use long sentences inside chips.

### Cards / Containers

- **Corner Style:** 16px for primary panels, 10px for nested working surfaces.
- **Background:** Panel surface for working regions, raised surface for subordinate content, sunken surface for inputs and board cells.
- **Shadow Strategy:** Low structural shadow by default; medium or large shadow only for popovers and dialogs.
- **Border:** 1px neutral border at rest, semantic border for active or warning state.
- **Internal Padding:** 16px to 20px depending on panel importance.

### Drawers

- **Shell:** Every side panel uses `Drawer.svelte`, which owns the scrim, enter motion, header, close button, and scrolling body. The modal rules in `modal.ts` apply unchanged.
- **Size:** `min(560px, 94vw)` and full height, anchored right. At the 520px phone breakpoint it becomes a full-width bottom sheet, `min(92vh, 840px)` tall with 16px top corners.
- **Header:** Optional eyebrow, 18px title with optional icon and status pill, one-line subtitle, and a 32px close button at the top right. The header stays visible while the body scrolls.
- **Motion:** The drawer slides in and the scrim fades in over `--transition-base`, which is 0ms under reduced motion. Closing is immediate, so focus returns to the opener without delay.

### Inputs / Fields

- **Style:** Sunken surface, 1px input border (`--border-input`), 10px radius, 10px 12px padding.
- **Focus:** Green border and a restrained green focus ring.
- **Error / Disabled:** Semantic red or amber callout for errors; disabled controls retain layout and use reduced opacity without losing their label.

### Navigation

- **Style:** Compact top bar with the product mark and active league/draft name. Settings is a quiet icon control. Draft switching is a disclosure menu attached to the active league name.
- **Workspace controls:** Use segmented tabs for view ranges such as live rounds versus full board, and keep them visually distinct from connection or sync status.
- **Mobile:** Stack controls when necessary; preserve the active state and keep overflow intentional rather than clipping text.

### Pick Strip

One line with the state ("You are on the clock" in amber, otherwise "N picks away"), the current pick, the next turn, the round direction, and Find player and Draft plan on the right. Find player and Draft plan appear once a recommendation exists, and never in board-only mode. Sync status lives in the top bar. The strip shows no pick clock because the draft payload has none.

### Draft Board

The live view shows the current and next round in 72px cells, with the legend and Full board in the board header. The board is a dense, structured grid. Round direction, pick number, team ownership, current pick, user picks, and traded picks must remain distinguishable through layout plus semantic color. Team headers are interactive roster entry points and should retain accessible names and hover/focus states.

### Roster Table

Team Manager's roster is one semantic table: Slot, Player (position chip, name, team), Week (`@ JAX`, `vs MIN`, or the amber BYE chip), Proj, and Status. Bench, injured reserve, and taxi are row groups in the same table. Rows are 44px. Proj is right-aligned in tabular figures; missing values are muted and say why ("No WR file", "No match"). Status is empty when clear, amber for caution and for "On bye", and red for out and IR, and the text always carries the meaning without the color. "On bye" appears only when the player has no injury flag, and it is hidden from assistive technology because the BYE chip already announces the week.

The header carries the confidence chip and "Manage data". The footer holds the coverage meter, the one action that improves it, and any schedule outage note. At the 760px compact breakpoint Proj and Status hide with `display: none`; Week stays so BYE is visible at every width, and injury flags move onto the player's team line. The table shows only what the payload contains and never ranks or compares players.

### AI Guidance

Call the strategist "Assistant" in copy. Say "Codex" only for the external program the user installs, signs in to, or configures. Separate metadata with " · ", show statuses as sentence-case labels rather than API values, and write errors as what happened, then what to do next.

Assistant recommendation, strategy, evidence, and conversation are progressively disclosed. The recommendation headline and short reason lead; analysis, alternatives, evidence, history, and user guidance open on demand. AI status, confidence, stale context, and provider availability must be explicit.

The call panel carries the only primary button: Ask Assistant, on a player card that shows the position chip, name, team, and whichever of ECR, ADP, Proj, and roster fit the payload holds. It never shows a computed score or rank, and placeholder ranks and rank-derived estimates do not count as ECR, ADP, or Proj. Fallbacks are titled "If <player> is gone". The collapsed Ask Assistant bar keeps its composer and three suggestion chips on one line, and asking expands the thread in place.

## Do's and Don'ts

### Do:

- **Do** show the current draft state and next useful action before secondary detail.
- **Do** use semantic colors consistently for readiness, AI/info, warning, and danger.
- **Do** keep controls keyboard-accessible with meaningful labels and visible focus.
- **Do** preserve the existing token system in `apps/web/src/lib/theme.css` and prefer shared primitives.
- **Do** use progressive disclosure for evidence, alternatives, settings, and history.
- **Do** keep draft-board horizontal scrolling explicit and usable on narrow screens.

### Don't:

- **Don't** turn every evidence item or explanation into an equally weighted card or button.
- **Don't** expose a deterministic local ranking as if it were AI advice or projection certainty.
- **Don't** overload the live draft surface with every tool at once.
- **Don't** use decorative gradients, glows, or color without a state or hierarchy purpose.
- **Don't** hide errors, stale data, provider state, or important uncertainty behind ambiguous copy.
- **Don't** introduce another visual language for Team Manager; extend the draft-room system.
