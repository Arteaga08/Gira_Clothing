import { OrderStatus } from "@gira/shared";

/**
 * The neobrutalist recipe, in ONE place. Lives in TypeScript rather than an
 * `@layer components` class on purpose: a typo here is a compile error,
 * whereas `className="nb-pressabl"` renders with no shadow and no warning at
 * all. Every component in this kit composes these instead of writing the
 * treatment inline.
 *
 * These are static strings resolved at build time — Tailwind scans this file
 * and emits the utilities it finds. Zero runtime cost.
 */

/**
 * 2px ink border + hard 4px offset shadow + 12px radius + flat fill.
 *
 * Carries `text-text-primary` on purpose: the page background is now
 * --color-wallpaper (verde bosque, dark), so body's default text colour is
 * --color-text-inverse (hueso). Every light surface — every panel, card,
 * stat tile — has to reset back to ink itself, or its text would render
 * hueso-on-hueso and vanish. Composing NB_SURFACE is what makes that reset
 * automatic instead of something every consumer has to remember.
 */
const NB_SURFACE_CHROME = "border-2 border-ink rounded-nb shadow-nb";
const NB_SURFACE = `${NB_SURFACE_CHROME} bg-surface text-text-primary`;

/**
 * The shared control chrome: height, radius, border, shadow, light-surface
 * text. Every text-input-height control reads this — Button (md), IconButton
 * (md), Field, SelectField, Segmented — so there is exactly one place that
 * says a control is 40px tall.
 *
 * FILL AND TEXT COLOUR: two `bg-*` (or two `text-*`) utilities on one element
 * are the same specificity, and Tailwind v4 emits them sorted by name, NOT by
 * their position in the class string. `bg-surface` therefore beats `bg-cta`
 * and `bg-brand`, and `text-text-primary` beats `text-text-inverse`, no matter
 * which comes last. A component that sets its own fill or text colour (Button
 * variants, a selected Segmented, an accented StatCard, Toast variants) must
 * compose the *_CHROME constant and name both explicitly — never add a second
 * fill on top of NB_CONTROL / NB_SURFACE.
 */
const NB_CONTROL_CHROME = "min-h-10 rounded-nb-sm border-2 border-ink shadow-nb-sm";
const NB_CONTROL = `${NB_CONTROL_CHROME} bg-surface text-text-primary`;

/**
 * The static (non-pressable) icon-tile chrome — IconButton composes this and
 * adds NB_PRESSABLE + the disabled chain; NotificationBell composes it alone,
 * since it's a `role="status"` indicator, not a button, and has nothing to
 * press. Sharing this is what used to be missing: NotificationBell hand-wrote
 * its own copy of these five classes, one radius change away from drifting.
 */
const NB_ICON_TILE =
  "inline-flex items-center justify-center rounded-nb-sm border-2 border-ink bg-surface text-text-primary shadow-nb-sm";

/**
 * Press feedback translates INTO the shadow instead of scaling — the
 * neobrutalist treatment approved in the design spec. `motion-reduce`
 * disables the translate entirely; the shadow itself never disappears.
 */
const NB_PRESSABLE =
  "transition-[transform,box-shadow] ease-out-expo duration-150 " +
  "hover:-translate-x-px hover:-translate-y-px hover:shadow-nb-lg " +
  "active:translate-x-0.5 active:translate-y-0.5 active:shadow-nb-pressed " +
  "motion-reduce:transition-none motion-reduce:hover:translate-x-0 motion-reduce:hover:translate-y-0 " +
  "motion-reduce:active:translate-x-0 motion-reduce:active:translate-y-0";

/**
 * One entry per enum member. `Record<OrderStatus, string>` is the point: drop
 * a status here and tsc fails the build. The CSS attribute-selector version
 * of this map (`.chip[data-status="refunded"]`) fails silently instead — a
 * colourless chip nobody notices until a customer does.
 */
const ORDER_STATUS_BG: Record<OrderStatus, string> = {
  [OrderStatus.PENDING_PAYMENT]: "bg-[var(--status-pending_payment)]",
  [OrderStatus.PAID]: "bg-[var(--status-paid)]",
  [OrderStatus.PROCESSING]: "bg-[var(--status-processing)]",
  [OrderStatus.SHIPPED]: "bg-[var(--status-shipped)]",
  [OrderStatus.DELIVERED]: "bg-[var(--status-delivered)]",
  [OrderStatus.CANCELLED]: "bg-[var(--status-cancelled)]",
  [OrderStatus.EXPIRED]: "bg-[var(--status-expired)]",
  [OrderStatus.REFUNDED]: "bg-[var(--status-refunded)]",
};

export {
  NB_SURFACE,
  NB_SURFACE_CHROME,
  NB_CONTROL,
  NB_CONTROL_CHROME,
  NB_ICON_TILE,
  NB_PRESSABLE,
  ORDER_STATUS_BG,
};
