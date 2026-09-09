---
target: apps/web/src/app/(admin)/resumen/page.tsx
total_score: 32
p0_count: 0
p1_count: 0
timestamp: 2026-08-05T16-39-57Z
slug: apps-web-src-app-admin-resumen-page-tsx
---
#### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | No freshness timestamp on KPIs/chart (OutboxHealthPanel has one, others don't) |
| 2 | Match System / Real World | 4 | n/a — operational vocabulary correct throughout |
| 3 | User Control and Freedom | 3 | Range/granularity in URL (deep-linkable); read-only screen so no undo needed |
| 4 | Consistency and Standards | 4 | n/a — single Segmented primitive, typography by role everywhere |
| 5 | Error Prevention | 3 | Client-side 2FA code validation present; no client email format check beyond type="email" |
| 6 | Recognition Rather Than Recall | 4 | n/a — selected state always visible, panel hints present |
| 7 | Flexibility and Efficiency | 3 | Cmd+K palette exists; no saved views or shortcuts beyond it |
| 8 | Aesthetic and Minimalist Design | 3 | High density by design (8 sections at once); every element earns its place, but risk of overload sub-xl |
| 9 | Error Recovery | 3 | Per-section Promise.allSettled isolates failures; SectionError doesn't point to the recovery action |
| 10 | Help and Documentation | 2 | Zero in-app help/tooltips (e.g. what "outbox" or the low-stock threshold means) |
| **Total** | | **32/40** | **Good — address weak areas, solid foundation** |

#### Anti-Patterns Verdict

**No, this does not read as AI-generated.**

**LLM assessment**: Committed, named color strategy (verde-bosque dominant, amarillo exclusive to CTA, rosa as brand identity) — the opposite of generic indigo/violet SaaS. Zero gradients, zero glassmorphism, zero blur; hard 2px ink borders + offset shadows throughout. Three deliberate type families with fixed jobs (Anton/Space Grotesk/Space Mono), never a default Inter. Brand rules enforced at compile time (`Record<OrderStatus, string>`), not vibes. The one shape shared with generic dashboards — a 3-up StatCard row with icon top-right — is executed with the system's own brutalist chrome and an explicit "one accent per screen" rule, not a bare tell.

**Deterministic scan**: 3 raw findings, only 1 real:
- **Confirmed** — `side-tab` accent border, `apps/web/src/components/shell/NavItem.tsx:42` (the active-state `border-l-2` that resolves to `border-brand`). This is the same issue already flagged in the prior `impeccable audit` pass (P2) — independently caught again here by the dedicated slop detector, which raises confidence it's a real, worth-fixing tell rather than a one-off judgment call.
- **False positive** — `border-accent-on-rounded`, `apps/web/src/components/resumen/AttentionBand.tsx:20`. The border is `border-ink` sitting on a `bg-ink` header (ink-on-ink) — structurally invisible, not a colored accent. The detector's heuristic (thick border + rounded corner) doesn't distinguish an ink structural divider from a decorative accent; this is the same "every border is ink" language used consistently across the whole system (`Panel.tsx`, `NB_SURFACE`), which did NOT trip the detector elsewhere.
- **Non-issue** — `side-tab`, `NavItem.tsx:22`. This is the disabled/"coming soon" nav item's `border-l-2 border-transparent` — a transparent border renders nothing, so there's no visible accent to flag. Detector matched on class name pattern, not computed color.

#### Overall Impression

The system is deliberate, documented, and enforced by tooling (compiler-breaking status maps, a token-drift test) — the opposite of a first-draft AI scaffold. The one real gap is a UI-density problem, not a taste problem: the Resumen header packs up to 7 selection pills into one row with no strong grouping, and the screen renders 8 attention-competing sections on load with no way to collapse any of them. Biggest opportunity: reduce the entry-point decision load in the header before touching anything visual.

#### What's Working

1. **Attention Band as a real triage pattern** (`AttentionBand.tsx`) — the only surface with `shadow-nb-lg`, explicitly range-independent, genuinely surfaces "what needs action now" first, matching the PRODUCT.md principle instead of just claiming it.
2. **Per-section failure isolation** via `Promise.allSettled` (`resumen/page.tsx`) — one failed API never blanks the whole screen; each panel degrades independently with its own `SectionError`.
3. **Design-system discipline enforced by the type system**, not convention — a missing `OrderStatus` case is a compile error, not a silent gap; this is rare rigor and it shows in how consistent every screen reads.

#### Priority Issues

**[P2] Resumen header overloaded with selection controls**
- **Why it matters**: `resumen/page.tsx:77-82` renders up to 7 `Segmented` pills (4 granularity + up to 3 range) in one row with only a `gap-2`/`flex-wrap` separating the two groups. For a "glance and act" console, the entry point forces reading 7 options to find the active one — friction exactly where there should be none.
- **Fix**: add a visible divider between the two control groups, or collapse range into a `SelectField` once options exceed 3.
- **Suggested command**: `impeccable layout` or `impeccable clarify`.

**[P2] `SectionError` doesn't point to its own recovery mechanism**
- **Why it matters**: `SectionError.tsx:11-12` intentionally omits a retry button because the TopBar's "Actualizar" button covers it — but that button lives in the TopBar, potentially out of view for a section further down the page (e.g. Top estampas), and the rendered message never mentions it.
- **Fix**: add a line of microcopy pointing at "Actualizar datos" or surface a retry affordance inline.
- **Suggested command**: `impeccable clarify`.

**[P2] Side-tab accent border on active nav item**
- **Why it matters**: `apps/web/src/components/shell/NavItem.tsx:42` — colored `border-l-2` on the selected sidebar item, confirmed independently by both the LLM review's sibling audit and the deterministic detector. It's the single recognizable "AI dashboard" tell in an otherwise deliberate system, and (per the prior audit) currently stacks on top of a broken `bg-brand-soft` token reference that should already carry the selected state on its own.
- **Fix**: drop the `border-l-2`/`border-brand`/`border-transparent` classes once the background token is fixed; background + bold + brand-colored text is enough signal.
- **Suggested command**: direct fix (already documented in the prior audit report).

**[P3] No freshness timestamp on KPIs/chart**
- **Why it matters**: `KpiRow.tsx`/`TimeseriesChart.tsx` don't show when the data was computed, unlike `OutboxHealthPanel` which exposes `oldestPendingAt`. For a console whose stated goal is faster operational decisions, not knowing if revenue shown is 2 minutes or 2 hours old is a real trust gap.
- **Fix**: add a relative timestamp near the `PageHeader`, consistent with the existing `OutboxHealthPanel` pattern.
- **Suggested command**: `impeccable craft`.

**[P3] Icon-only TopBar buttons with no visible label**
- **Why it matters**: `TopBar.tsx:24-34` — refresh, notifications, and mobile menu are icon-only (accessible via `aria-label`, but visually mute for a new team member before hovering). Staff rotation makes icon-learning cost non-zero.
- **Fix**: native `title` tooltip (already cheap) or a visible label at `lg:` and up.
- **Suggested command**: `impeccable clarify`.

#### Persona Red Flags

**Alex (Power User — ops staff working queues all day)**: No saved views or keyboard shortcuts beyond Cmd+K. The 12-combination range×granularity matrix is always fully visible even though daily use likely concentrates on 2-3 combinations — no shortcut promotes the common case. Would want one-key jumps to "today" / "this week" without touching either Segmented row.

**Jordan (First-Timer — new hire on their first shift)**: Zero contextual help anywhere (no tooltip explains "outbox," the low-stock threshold, or what triggers the Attention Band's "urgente" level). The 8-section dense dashboard with no onboarding tour means a first-timer has to reverse-engineer domain vocabulary from labels alone. Icon-only TopBar actions add a small extra decoding cost on day one.

#### Minor Observations

- `Button.tsx:27` — the `ghost` variant assumes a light-surface ancestor by comment, not runtime guard; fine today (only used inside Pagination, inside a Panel), but fragile if reused elsewhere.
- `DistributionPanel.tsx:50-60` — 9 status-color swatches in a legend with no grouping between "in-progress" and "terminal" states; correct per DESIGN.md (status never borrows brand color) but slower to scan than it needs to be.
- `resumen/page.tsx` — `DistributionPanel`/`LowStockPanel` use a generic `GENERIC_SECTION_ERROR` message directly instead of `messageOf(...)` like the other three sections; same rendered text today since they share `overviewOutcome`, but a pattern inconsistency worth normalizing.

#### Questions to Consider

- With 8 sections always rendered, does every operator need all of them every day, or would hiding a rarely-checked panel (e.g. notification health, if it's reliably healthy) reduce scroll without losing anything?
- The Attention Band is range-independent by design — how does an operator tell "urgent right now" apart from an old resolved order that the band doesn't filter by date?
- Does the team's actual daily usage really span all 12 range×granularity combinations, or would 2-3 of them deserve to be one-click defaults instead of a fully-exposed matrix?
