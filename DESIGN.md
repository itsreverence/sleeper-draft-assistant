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
  border-strong: "#363c46"
  text-primary: "#f2f4f6"
  text-secondary: "#aab0ba"
  text-muted: "#767e8a"
  accent: "#34d399"
  accent-strong: "#10b981"
  info: "#8b9bf8"
  warning: "#f5b544"
  danger: "#f87171"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "23px"
    fontWeight: 700
    lineHeight: 1.3
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 700
    lineHeight: 1.35
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14.5px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.05em"
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
- **Muted Text** (#767e8a): Labels, metadata, and low-priority status text.

### Named Rules

**The Semantic Accent Rule.** Accent colors communicate state or action. Do not use them as decoration or apply them uniformly to every surface.

## Typography

**Display Font:** Inter (with ui-sans-serif, system-ui, sans-serif fallbacks)

**Body Font:** Inter (with ui-sans-serif, system-ui, sans-serif fallbacks)

**Character:** Compact, neutral, and highly legible at small sizes. Weight and color carry hierarchy more often than oversized type.

### Hierarchy

- **Display** (700, 30px, 1.15): Product and connected-league headings.
- **Headline** (700, 23px, 1.3): Primary workspace headings and prominent decisions.
- **Title** (700, 19px, 1.35): Panel headings and important subsections.
- **Body** (400, 14.5px, 1.4): Normal copy and explanations.
- **Label** (700, 11px, 1.3, slight positive tracking): Eyebrows, metadata, and compact status labels.

### Named Rules

**The Decision-First Type Rule.** Use the largest weight and contrast for the current decision or state, not for secondary evidence or settings chrome.

## Layout

The application uses a centered responsive shell with a constrained content column. Connected workflows are top-anchored so the board and working panels remain immediately available. The pre-connect state may use a narrower centered column to keep the entry task deliberate.

Draft pages use a wide board region with intentional horizontal scrolling when team count exceeds the available viewport. The board keeps the round column and team header legible while the page below provides AI guidance, roster context, strategy, and conversation. Mobile layouts stack working regions and keep horizontal board scrolling explicit with a visible hint.

Spacing follows the 4px base scale with common steps of 8px, 12px, 16px, 20px, and 24px. Group related controls tightly and use a full divider or larger gap before a separate workflow.

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

- **Style:** Small pill with semantic border and soft tint.
- **State:** Use for confidence, setup readiness, warnings, AI provider state, and compact counts. Do not use long sentences inside chips.

### Cards / Containers

- **Corner Style:** 16px for primary panels, 10px for nested working surfaces.
- **Background:** Panel surface for working regions, raised surface for subordinate content, sunken surface for inputs and board cells.
- **Shadow Strategy:** Low structural shadow by default; medium or large shadow only for popovers and dialogs.
- **Border:** 1px neutral border at rest, semantic border for active or warning state.
- **Internal Padding:** 16px to 20px depending on panel importance.

### Inputs / Fields

- **Style:** Sunken surface, 1px strong border, 10px radius, 10px 12px padding.
- **Focus:** Green border and a restrained green focus ring.
- **Error / Disabled:** Semantic red or amber callout for errors; disabled controls retain layout and use reduced opacity without losing their label.

### Navigation

- **Style:** Compact top bar with the product mark and active league/draft name. Settings is a quiet icon control. Draft switching is a disclosure menu attached to the active league name.
- **Workspace controls:** Use segmented tabs for view ranges such as live rounds versus full board, and keep them visually distinct from connection or sync status.
- **Mobile:** Stack controls when necessary; preserve the active state and keep overflow intentional rather than clipping text.

### Draft Board

The board is a dense, structured grid. Round direction, pick number, team ownership, current pick, user picks, and traded picks must remain distinguishable through layout plus semantic color. Team headers are interactive roster entry points and should retain accessible names and hover/focus states.

### AI Guidance

AI call, strategy, evidence, and conversation are progressively disclosed. The recommendation headline and short reason lead; analysis, alternatives, evidence, history, and user guidance open on demand. AI status, confidence, stale context, and provider availability must be explicit.

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
