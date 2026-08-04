import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type BadgeVariant = "neutral" | "count" | "ok" | "warn" | "danger";

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

/**
 * Shared with StatusChip (see ./StatusChip.tsx), which composes BADGE_BASE
 * directly instead of this component — a status chip's fill comes from a
 * per-enum-member map (nine order statuses, five shipment statuses), not
 * from this five-variant set.
 *
 * Mono + uppercase because a badge IS the "Labels/Metadata" role in the type
 * system (see typography.ts T_LABEL) — every badge is metadata about
 * something else, never prose.
 */
const BADGE_BASE =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-nb-pill border-[1.5px] border-ink px-2 py-0.5 font-mono text-2xs font-bold uppercase tracking-wide text-text-primary";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  /** The "Pronto" pill on an unavailable nav item. */
  neutral: "bg-surface",
  /** A count — Tabs' per-item count, LowStockPanel's in-stock number. */
  count: "bg-surface-sunken",
  ok: "bg-success-soft",
  warn: "bg-warning-soft",
  danger: "bg-danger-soft",
};

const Badge = ({ variant = "neutral", children, className }: BadgeProps) => (
  <span className={cn(BADGE_BASE, VARIANT_CLASSES[variant], className)}>{children}</span>
);

export type { BadgeProps, BadgeVariant };
export { Badge, BADGE_BASE };
