import { NB_PRESSABLE } from "@/components/ui/styles";

/**
 * The navbar sits on no background of its own, so every item is a pill that
 * carries its own fill: readable over whatever scrolls underneath. Colours come
 * from the skin (`--store-pill-*`); press feedback is the system's NB_PRESSABLE.
 */
const NAV_PILL =
  "inline-flex min-h-11 items-center justify-center rounded-nb-pill border-2 border-ink bg-[var(--store-pill-bg)] text-[var(--store-pill-fg)] shadow-nb-sm " +
  `font-bold text-base md:text-lg ${NB_PRESSABLE}`;

const NAV_PILL_CURRENT = "aria-[current=page]:bg-[var(--store-pill-current-bg)]";

export { NAV_PILL, NAV_PILL_CURRENT };
