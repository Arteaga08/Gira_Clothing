---
name: Gira Clothing — Design System
description: A neobrutalist system, verde-bosque-dominant, running the admin console today and the storefront in Bloque 3.
colors:
  verde-bosque: "#1F3D1F"
  blanco-hueso: "#F5F3EE"
  negro-tinta: "#0D0D0D"
  rosa-chicle: "#FF2E9E"
  amarillo-electrico: "#F5FF3D"
  lila-suave: "#C9A8FF"
  menta: "#D9F2D0"
  wallpaper: "{colors.verde-bosque}"
  surface: "{colors.blanco-hueso}"
  surface-raised: "#EDEAE2"
  surface-sunken: "#E3DFD4"
  ink: "{colors.negro-tinta}"
  text-primary: "{colors.negro-tinta}"
  text-secondary: "#3D3A33"
  text-muted: "#6B675C"
  text-inverse: "{colors.blanco-hueso}"
  brand: "{colors.verde-bosque}"
  brand-hover: "#16301A"
  brand-subtle: "{colors.menta}"
  cta: "{colors.amarillo-electrico}"
  cta-hover: "#E4EE1F"
  accent: "{colors.rosa-chicle}"
  border: "#D8D3C6"
  focus: "oklch(55% 0.18 250)"
  danger: "oklch(52% 0.19 25)"
  danger-soft: "oklch(92% 0.05 25)"
typography:
  display:
    fontFamily: "Anton, Impact, 'Haettenschweiler', sans-serif"
    fontWeight: 400
    textTransform: uppercase
    note: "One weight only — never request 700 on this family, the browser fakes it and smudges the strokes."
  sans:
    fontFamily: "'Space Grotesk', system-ui, -apple-system, sans-serif"
    weights: [400, 500, 700]
  mono:
    fontFamily: "'Space Mono', ui-monospace, 'SF Mono', Menlo, monospace"
    weights: [400, 700]
rounded:
  sm: "8px"
  md: "12px"
  pill: "999px"
spacing:
  scale: "8px base — 8 / 16 / 24 / 32 / 40 / 56"
  exception: "Button md vertical padding is 12px, not a multiple of 8 — 12 + 16 line-height + 12 lands on the shared 40px control height."
components:
  button-primary:
    backgroundColor: "{colors.cta}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    padding: "12px 24px"
    note: "CTA is EXCLUSIVE to amarillo. Never brand, never accent."
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "24px"
---

# Design System: Gira Clothing

## 1. Overview

**Creative North Star: "The Field Console, Printed in Forest Ink"**

Verde bosque is not an accent — it's the surface every screen sits on, tienda and consola alike.
Content lives on hueso islands (cards, panels, the sidebar), bordered and shadowed in tinta the way
a screen-printed garment carries a hard registration line. Amarillo is reserved, absolutely, for the
one thing a person can act on right now; rosa carries the brand's identity everywhere else a title or
a price needs to announce itself.

This is a deliberate pivot from the tinted-neutral placeholder system built in M6–M8: that system was
light-dominant with a single sparse green accent. This one commits — a Full Palette / Committed
strategy, not Restrained — because the brand called for it explicitly, twice, in the same
conversation that built it.

**Key Characteristics:**
- Verde bosque (`#1F3D1F`) is the dominant background — page, sidebar rail, everything that isn't a
  card — in the admin console exactly as much as in the future storefront.
- Hard 2px ink borders and flat offset shadows (`shadow-nb`) instead of blur/opacity for depth.
- Amarillo eléctrico (`#F5FF3D`) fills the primary CTA and nothing else, ever.
- Rosa chicle (`#FF2E9E`) carries brand identity — logo, prices, link/title emphasis — always at
  ≥18px/700, never in running prose (it fails WCAG AA at body size: ~3.1:1 on hueso).
- Three type families, three fixed jobs: Anton titles (always uppercase, one weight), Space Grotesk
  reads, Space Mono counts.
- One shape language, two densities: the console runs tight, the storefront (Bloque 3) runs looser —
  same tokens, one step up.

## 2. Colors

### The seven brand literals
| Token | Hex | Share | Role |
|---|---|---|---|
| `--verde-bosque` | `#1F3D1F` | 60% | Dominant background — page, header strips, section dividers |
| `--blanco-hueso` | `#F5F3EE` | 25% | Card / panel surface, sidebar rail |
| `--negro-tinta` | `#0D0D0D` | 15% | Every border, every hard shadow, ink text |
| `--rosa-chicle` | `#FF2E9E` | — | Brand identity: logo, prices, link/title emphasis |
| `--amarillo-electrico` | `#F5FF3D` | — | **Exclusive** to the primary CTA |
| `--lila-suave` | `#C9A8FF` | — | Tile variant in an icon grid (reserved, not yet consumed) |
| `--menta` | `#D9F2D0` | — | Soft secondary background — doubles as `--color-brand-subtle` |

### Named Rules
**The CTA-Exclusivity Rule.** Amarillo fills `--color-cta` and nothing else. A second yellow surface
on the same screen is always a bug — it stops meaning "you can act here."

**The Rosa-at-Size Rule.** Rosa chicle measures 3.1:1 on hueso and 3.5:1 on verde bosque — both
below the 4.5:1 a paragraph needs, both above the 3:1 a large/bold element or a UI component needs.
So: rosa in a heading ≥18px/700, a bold price, or a chip fill — never in a sentence of body text.

**Text-color-follows-surface.** Body's default text is `--color-text-inverse` (hueso), because the
page background is verde bosque now, not a light neutral. Every light surface (`NB_SURFACE`,
`NB_CONTROL`, the sidebar rail) resets back to `--color-text-primary` itself — components never rely
on inherited color across a surface boundary.

### Status colors
Nine order-status hues and five shipment-status hues (`--status-*`, `--ship-*`) are their own flat
pastel vocabulary, independent of the brand palette — a status is never conveyed by brand color.
Every chip pairs its fill with an ink border and dark text.

### Feedback
`--color-info`, `--color-warning-soft`, `--color-success-soft`, `--color-danger-soft` are each their
own token. `Notice`'s "info" variant used to borrow `--status-pending_payment` (an order-status hue
repurposed for an unrelated banner) — that coincidence is exactly the drift this file exists to
prevent.

## 3. Typography

Three families, three jobs, never crossed:

| Family | Job | Weights |
|---|---|---|
| **Anton** | Every title, always uppercase | 400 only — never synthesize bold |
| **Space Grotesk** | Everything read: prose, labels, buttons | 400 / 500 / 700 |
| **Space Mono** | Everything counted: money, SKUs, labels/metadata | 400 / 700 |

### Two densities, one ladder shape
Product UI (the console) runs a fixed rem scale, tighter ratio, no fluid `clamp()`. The storefront
(Bloque 3) runs the same roles one step up. Never mix a console recipe and a store recipe on the same
screen.

| Role | Console | Store (reserved) |
|---|---|---|
| H1 / page title | Anton 32px | Anton 42px |
| H2 / section | Anton 24px | Anton 32px |
| H3 / panel title | Anton 16px | Anton 20px |
| H4 | Grotesk 14px / 700 | Grotesk 16px / 700 |
| Body | Grotesk 14px / 1.5 | Grotesk 16px / 1.6 |
| Body sm | Grotesk 13px | Grotesk 14px |
| Label / metadata | Mono 11px / 700 / UPPER | Mono 12px / 700 / UPPER |
| Helper | Mono 11px, `--color-text-muted` | Mono 11px |

Recipes live in `apps/web/src/components/ui/typography.ts` as named exports (`T_PAGE_TITLE`,
`T_PANEL_TITLE`, `T_LABEL`, …) — a component asks for a role, never picks a size or family by hand.
`T_PAGE_TITLE` and `T_SECTION_TITLE` bake in `text-text-inverse`: every page title in this app renders
directly on verde bosque, never inside a card.

### Named Rules
**The Anton-Never-Bold Rule.** Anton ships one weight. Bolding it is always a synthesis bug.

**The Numbers-Are-Mono Rule.** Anything reconcilable against a receipt or shipping label — money,
units, SKU, order id — renders in `--font-mono`.

## 4. Spacing

An 8px-multiple scale, drawn to real size in the system sheet (`mockups/sistema.html`).

| Value | Use |
|---|---|
| 8px | Icon + text, label + control |
| 16px | Control padding, gap between sibling buttons |
| 24px | Card padding, gap between cards |
| 32px | Gap between medium elements within a section |
| 40px | Gap between major page sections |
| 56px | Gap between large blocks (storefront-scale) |

**The 12px exception.** Button md's vertical padding is 12px, not a multiple of 8 — but 12 + 16px
line-height + 12 lands exactly on 40px, the shared control height. The rule is "lands on the grid,"
not "every literal number is 8×n."

Implemented via Tailwind's native 4px-unit scale (`gap-2`=8px, `gap-4`=16px, `gap-6`=24px, `gap-8`=32px,
`gap-10`=40px, `gap-14`=56px) — the project's own `--space-*` custom tokens were removed; they
duplicated this scale and were never referenced, which is exactly how spacing drifted before.

## 5. States

Seven states, mandatory on every interactive primitive:

| State | Treatment |
|---|---|
| default | 2px ink border + `shadow-nb-sm` |
| hover | translate -1px/-1px + `shadow-nb-lg` |
| focus-visible | 2px outline in `--color-focus` (the one blue in the system), global, never overridden |
| active | translate +2px/+2px + `shadow-nb-pressed` (shadow collapses to zero) |
| disabled | 45% opacity, shadow removed, pointer-events none |
| loading | spinner at 700ms (not 1s — faster reads as faster loading), `aria-busy` |
| selected | `bg-brand` (verde bosque) fill + `text-text-inverse` |

`Segmented` — the primitive behind RangeSelector, GranularitySelector, the chart's series toggle and
the TopBar search trigger — is what makes "selected" consistent; before it existed, each of those four
had its own radius, height and shadow for the same gesture.

## 6. Elevation

Unchanged from M6: flat by default, depth conveyed entirely through solid offset shadows.
`shadow-nb-sm` (2px), `shadow-nb` (4px, the default), `shadow-nb-lg` (6px, at most one surface per
screen), `shadow-nb-pressed` (0, the pressed state). Press-into-shadow, never scale.

## 7. Components

### Buttons
2px border, `NB_CONTROL`'s shared 40px height. Primary = amarillo + tinta text (never hueso — too
light for white text). Secondary = hueso + tinta, the default `NB_CONTROL` treatment. Ghost = starts
transparent, gains border/shadow on hover; assumes a light-surface ancestor. Danger = danger-soft.

### Segmented / Badge / ListRow / MetricTile
Four primitives extracted because each pattern was previously hand-copied 3–4 times with drifting
details — see `apps/web/src/components/ui/{Segmented,Badge,ListRow,MetricTile}.tsx`. Badge is also
the base `StatusChip` composes, so the nine order-status / five shipment-status chips share the same
shape as every other badge in the app.

### Cards / Panels
12px radius, 24px internal padding (the brand's own spacing spec calls for 24px card padding),
2px ink border, `shadow-nb`. Panels never nest.

### Inputs
Surface fill, 2px ink border (danger on error), 8px radius, 40px height, no inset shadow. Focus
shifts the border to `--color-focus`.

## 8. Do's and Don'ts

### Do:
- **Do** keep every color and font-family literal inside `tokens.css` / `fonts.ts` — components read
  tokens, never inline values (`designTokens.test.ts` enforces this).
- **Do** treat amarillo as CTA-only, everywhere, no exceptions.
- **Do** size rosa chicle text ≥18px/700 or confine it to a chip fill.
- **Do** reset text color explicitly on every light surface (`NB_SURFACE`, `NB_CONTROL`) — body's
  default is now hueso-on-verde, not ink-on-neutral.
- **Do** render money and unit counts in `--font-mono`, always.

### Don't:
- **Don't** request a bold weight on Anton.
- **Don't** use glassmorphism, blur, or translucency anywhere except `--color-scrim` behind a mobile
  drawer.
- **Don't** use `border-left`/`border-right` as a colored accent stripe.
- **Don't** let a generic feedback banner (`Notice`) borrow an order-status color token — feedback
  colors (`--color-info`, `--color-warning-soft`, …) are their own vocabulary.
- **Don't** nest a card inside another card.
