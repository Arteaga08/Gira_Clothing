---
name: Gira Clothing — Admin Dashboard
description: A neobrutalist operations console for running a custom-print apparel store.
colors:
  ink: "oklch(24% 0.02 162)"
  wallpaper: "oklch(96.5% 0.006 162)"
  surface: "oklch(99.2% 0.003 162)"
  surface-raised: "oklch(97.6% 0.008 162)"
  surface-sunken: "oklch(93.8% 0.008 162)"
  brand: "oklch(46% 0.11 162)"
  brand-hover: "oklch(40% 0.11 162)"
  brand-soft: "oklch(46% 0.11 162 / 0.1)"
  brand-subtle: "oklch(94% 0.03 162)"
  accent: "oklch(62% 0.16 48)"
  accent-soft: "oklch(62% 0.16 48 / 0.14)"
  text-primary: "oklch(24% 0.02 162)"
  text-secondary: "oklch(48% 0.015 162)"
  text-muted: "oklch(60% 0.012 162)"
  text-inverse: "oklch(98% 0.004 162)"
  border: "oklch(88% 0.01 162)"
  focus: "oklch(55% 0.18 250)"
  success: "oklch(52% 0.14 150)"
  warning: "oklch(68% 0.15 75)"
  danger: "oklch(52% 0.19 25)"
  danger-soft: "oklch(92% 0.05 25)"
  status-pending-payment: "oklch(89% 0.1 85)"
  status-paid: "oklch(90% 0.09 152)"
  status-processing: "oklch(88% 0.09 245)"
  status-shipped: "oklch(88% 0.09 205)"
  status-delivered: "oklch(88% 0.13 122)"
  status-disputed: "oklch(87% 0.1 25)"
typography:
  display:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "normal"
  title:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    letterSpacing: "0.02em"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
    fontSize: "0.9375rem"
    fontWeight: 700
rounded:
  sm: "8px"
  md: "12px"
  pill: "999px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  6: "24px"
  8: "32px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.text-inverse}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.brand-hover}"
  stat-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "16px"
  stat-card-accent:
    backgroundColor: "{colors.brand-subtle}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "16px"
---

# Design System: Gira Clothing — Admin Dashboard

## 1. Overview

**Creative North Star: "The Field Console"**

This is not a marketing surface, it is the instrument panel an operations team stares at during a
shift: order queues, stock levels, notification failures. Every choice serves speed of reading over
decoration. The system borrows its vocabulary from neobrutalism on purpose, not as a trend but as a
literal metaphor: solid ink borders and hard offset shadows read like a printed control panel,
something built rather than styled, exactly right for a store that sells physical printed apparel.

It explicitly rejects the generic SaaS-dashboard look: no glassmorphism, no purple-to-blue
gradients, no hairline 1px borders that vanish at a glance, no gradient-text hero metrics. Neutrals
are never truly grey; every surface is tinted toward the brand hue (chroma 0.003–0.02) so the whole
UI reads as one material, not a stack of disconnected panels.

**Key Characteristics:**
- Hard 2px ink borders and flat offset shadows (`shadow-nb`) instead of blur/opacity for depth.
- One accent color used sparingly, reserved for exactly one KPI per screen.
- Status conveyed by a wide, deliberately non-semantic palette of nine order-status hues, always
  paired with an ink border and dark text, never by hue alone.
- Zero decorative motion; state feedback only, translated into shadow offset, not scale or blur.

## 2. Colors

Tinted neutrals carry the whole surface; one desaturated green-leaning accent is reserved for a
single highlighted KPI per screen.

### Primary
- **Deep Forest Ink** (`oklch(46% 0.11 162)`, `--color-brand`): the one accent. Used on primary
  buttons and the single highlighted stat card per screen — never more than one per screen.

### Secondary
- **Warm Rust** (`oklch(62% 0.16 48)`, `--color-accent`): restrained to chart comparison series.
  Never used for buttons, chips, or navigation.

### Neutral
- **Ink** (`oklch(24% 0.02 162)`, `--color-ink`): every border and every hard shadow in the system.
  Never a background.
- **Wallpaper** (`oklch(96.5% 0.006 162)`, `--color-wallpaper`): the app-shell background, behind
  every card.
- **Surface** (`oklch(99.2% 0.003 162)`, `--color-surface`): card and panel fill.
- **Surface Raised / Sunken**: nested emphasis inside a panel (raised for a header strip, sunken for
  an inset well) without ever introducing a shadow inside a shadow.
- **Text Primary / Secondary / Muted / Inverse**: four steps of the same ink hue, never pure black,
  reserved for text roles from headings down to disabled captions.

### Named Rules
**The One Accent Rule.** `--color-brand` appears on at most one stat card and interactive primary
actions per screen. A second "highlighted" tile on the same screen is always a bug, not a design
choice.

**The Nine-Hue Status Rule.** Order and shipment statuses each get their own hue from a
wayfinding palette (`--status-*`, `--ship-*`), always with an ink border and dark text. A status is
never conveyed by fill color alone.

## 3. Typography

**Display Font:** Inter (with system-ui, -apple-system, "Segoe UI", Roboto fallback)
**Label/Mono Font:** JetBrains Mono (with ui-monospace, "SF Mono", Menlo, Consolas fallback)

**Character:** A single, unpretentious grotesque for everything a person reads, and a monospace
reserved for anything a person counts: money, quantities, SKUs. The pairing signals "this number is
exact," never decorative. Both are placeholders pending Gira's final brand typeface (see
`src/app/fonts.ts`); component structure and token names do not change when the real family lands.

### Hierarchy
- **Display** (700, 1.75rem, 1.2): page-level `<h1>` titles ("Resumen", "Pedidos").
- **Title** (700, 1.125rem, 1.3): panel and card section headers ("Pedidos por día").
- **Body** (400, 0.9375rem, 1.5): all prose, labels, table cells. Capped at 65–75ch where it wraps.
- **Label** (700, 0.75rem, uppercase, 0.02em tracking): stat-card labels, chip text, form labels.
- **Mono** (700, 0.9375rem): money, unit counts, SKUs, dates in tabular contexts.

### Named Rules
**The Numbers-Are-Mono Rule.** Any value the user might reconcile against a receipt or a shipping
label (money, units, SKU, order id) renders in `--font-mono`. Everything else is `--font-sans`.

## 4. Elevation

Flat by default, with depth conveyed entirely through solid offset shadows, never blur or opacity.
A shadow is either fully present (at rest) or collapses to zero on press, simulating a physical
object being pushed flush against the surface behind it.

### Shadow Vocabulary
- **`shadow-nb-sm`** (`2px 2px 0 0 var(--color-ink)`): small controls, chips, ghost-button hover.
- **`shadow-nb`** (`4px 4px 0 0 var(--color-ink)`): the default card/panel shadow.
- **`shadow-nb-lg`** (`6px 6px 0 0 var(--color-ink)`): the single most important surface on a screen
  (the attention band), and the hover state of a pressable card.
- **`shadow-nb-pressed`** (`0 0 0 0 var(--color-ink)`): the active/pressed state — the shadow
  disappears entirely as the element translates into it.

### Named Rules
**The Press-Into-Shadow Rule.** Interactive elements never scale on press. They translate a couple
of pixels toward their own shadow, which shrinks to zero at `active`. `motion-reduce` disables the
translate but the shadow itself never disappears, so the element never looks broken.

## 5. Components

### Buttons
- **Shape:** 8px radius (`rounded-nb-sm`), 2px ink border, small offset shadow at rest.
- **Primary:** brand fill, inverse text, 8–16px padding depending on size.
- **Secondary:** surface fill, primary text, same border/shadow treatment.
- **Ghost:** starts with no border/shadow; on hover gains the ink border and small shadow back, so a
  ghost button never looks like a plain link at rest.
- **Danger:** danger-soft fill with danger text, same shape language as every other variant.
- **Hover / Focus:** translate up-left 1px and grow the shadow to `-lg`; focus ring uses
  `--color-focus`, a distinct blue never used anywhere else in the palette.

### Chips
- **Style:** flat status-colored fill, 1.5px ink border, dark text — never white text on a saturated
  fill, since the palette is intentionally pastel, not saturated.
- **State:** one fixed fill per enum member (see `ORDER_STATUS_BG`/`SHIPMENT_STATUS_BG`), no
  hover/selected state; chips are informational, not interactive.

### Cards / Containers (`StatCard`, `Panel`)
- **Corner Style:** 12px radius (`rounded-nb`).
- **Background:** surface fill; the single accented KPI per screen uses `brand-subtle` instead.
- **Shadow Strategy:** `shadow-nb` at rest; panels never nest (a card inside a card is always wrong
  in this system).
- **Border:** 2px ink, always.
- **Internal Padding:** 16px (`space-4`).

### Inputs / Fields
- **Style:** surface fill, 2px ink border, 8px radius, no inset shadow.
- **Focus:** border shifts to `--color-focus`, no glow/blur.
- **Error:** border shifts to `--color-danger`, helper text below in the same color.

### Navigation (sidebar + topbar)
- **Style:** surface-raised fill, 2px ink border on the leading edge, active item marked by
  `brand-subtle` fill plus bold label, never by an underline or a colored stripe.
- **Mobile:** sidebar collapses to an off-canvas drawer sliding in from the left, `--color-scrim`
  behind it (the one intentionally translucent surface in the whole system).

### Attention Band (signature component)
A full-width strip at the top of Resumen, the one surface that earns `shadow-nb-lg` outside of
hover state: an ink-filled header in inverse text, then a grid of small tiles colored by
`warn`/`danger`/`clear` level. It is the loudest element on the busiest screen, on purpose — the
one place where three-way color state actually needs to compete with everything else on the page.

## 6. Do's and Don'ts

### Do:
- **Do** keep every color literal inside `tokens.css`; components read tokens, never inline hex or
  oklch values (`designTokens.test.ts` enforces this).
- **Do** use `shadow-nb-lg` for at most one surface per screen — the thing that most needs to
  interrupt the reader.
- **Do** render money and unit counts in `--font-mono`, always.
- **Do** draw every state explicitly (empty, error, zero), never leave a silent gap where data
  should be — a gap reads as "broken," a labeled empty state reads as "nothing yet."

### Don't:
- **Don't** use glassmorphism, blur, or translucency anywhere except `--color-scrim` behind a mobile
  drawer, which is the one deliberate exception.
- **Don't** use gradients anywhere except `--pattern-zero-bar` (the diagonal hatch for a zero-value
  chart bar), which is a texture, not a decoration.
- **Don't** use `border-left`/`border-right` as a colored accent stripe on a card or list row.
  Status and emphasis are conveyed by full borders, background tints, or leading icons/numbers.
- **Don't** accent more than one stat card per screen with `brand-subtle`. A second accented tile is
  always a mistake, not an intentional emphasis.
- **Don't** nest a card inside another card. If a panel needs internal grouping, use spacing and a
  divider, not a second bordered surface.
