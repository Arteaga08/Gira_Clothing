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

/** 2px ink border + hard 4px offset shadow + 12px radius + flat fill. */
const NB_SURFACE = "bg-surface border-2 border-ink rounded-nb shadow-nb";

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

export { NB_SURFACE, NB_PRESSABLE, ORDER_STATUS_BG, SHIPMENT_STATUS_BG };
