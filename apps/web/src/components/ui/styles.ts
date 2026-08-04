import { OrderStatus, ShipmentStatus } from "@gira/shared";

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
const NB_SURFACE = "bg-surface border-2 border-ink rounded-nb shadow-nb text-text-primary";

/**
 * The shared control chrome: height, radius, border, shadow, light-surface
 * text. Every text-input-height control reads this — Button (md), IconButton
 * (md), Field, SelectField, Segmented — so there is exactly one place that
 * says a control is 40px tall. Deliberately excludes background: Button's
 * primary/danger variants and Field's error state each override it, and
 * `bg-*` utilities of different values compose safely by simple class-string
 * concatenation the same way NB_PRESSABLE's ghost variant already overrides
 * NB_CONTROL's border/shadow below.
 */
const NB_CONTROL = "min-h-10 rounded-nb-sm border-2 border-ink bg-surface text-text-primary shadow-nb-sm";

/**
 * The static (non-pressable) icon-tile chrome — IconButton composes this and
 * adds NB_PRESSABLE + the disabled chain; NotificationBell composes it alone,
 * since it's a `role="status"` indicator, not a button, and has nothing to
 * press. Sharing this is what used to be missing: NotificationBell hand-wrote
 * its own copy of these five classes, one radius change away from drifting.
 */
const NB_ICON_TILE = "inline-flex items-center justify-center rounded-nb-sm border-2 border-ink bg-surface text-text-primary shadow-nb-sm";

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
 * of this map (`.chip[data-status="disputed"]`) fails silently instead — a
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
  [OrderStatus.DISPUTED]: "bg-[var(--status-disputed)]",
};

const SHIPMENT_STATUS_BG: Record<ShipmentStatus, string> = {
  [ShipmentStatus.IN_TRANSIT]: "bg-[var(--ship-in_transit)]",
  [ShipmentStatus.OUT_FOR_DELIVERY]: "bg-[var(--ship-out_for_delivery)]",
  [ShipmentStatus.DELIVERED]: "bg-[var(--ship-delivered)]",
  [ShipmentStatus.RETURNED]: "bg-[var(--ship-returned)]",
  [ShipmentStatus.LOST]: "bg-[var(--ship-lost)]",
};

export { NB_SURFACE, NB_CONTROL, NB_ICON_TILE, NB_PRESSABLE, ORDER_STATUS_BG, SHIPMENT_STATUS_BG };
