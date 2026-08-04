import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { NB_CONTROL, NB_PRESSABLE } from "./styles";

interface SegmentedProps {
  selected: boolean;
  children: ReactNode;
  className?: string;
  /** Renders a next/link with `aria-current="page"` — RangeSelector's case. */
  href?: string;
  /** Renders a `<button>` with `aria-pressed` — GranularitySelector / chart toggle's case. */
  onClick?: () => void;
  disabled?: boolean;
}

/**
 * The one segmented-control treatment in the system. Before this existed,
 * RangeSelector, GranularitySelector, the TimeseriesChart series toggle and
 * the TopBar search trigger each hand-rolled their own version — four radii,
 * three heights, two shadow depths for the same gesture.
 *
 * `href` renders a next/link (client-side navigation, `aria-current`);
 * `onClick` renders a `<button>` (`aria-pressed`). Exactly one is expected.
 */
const Segmented = ({ selected, children, className, href, onClick, disabled }: SegmentedProps) => {
  const classes = cn(
    NB_CONTROL,
    "inline-flex items-center gap-2 whitespace-nowrap px-4 py-2 font-mono text-xs font-bold uppercase tracking-wide",
    NB_PRESSABLE,
    selected && "bg-brand text-text-inverse",
    disabled && "pointer-events-none opacity-45 shadow-none",
    className,
  );

  if (href) {
    return (
      <Link href={href} aria-current={selected ? "page" : undefined} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" aria-pressed={selected} disabled={disabled} onClick={onClick} className={classes}>
      {children}
    </button>
  );
};

export type { SegmentedProps };
export { Segmented };
