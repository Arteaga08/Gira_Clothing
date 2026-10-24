import { NB_PRESSABLE } from "@/components/ui/styles";

/**
 * The navbar sits on no background of its own, so every item is a pill that
 * carries its own fill: readable over whatever scrolls underneath. Colours come
 * from the skin (`--store-pill-*`); press feedback is the system's NB_PRESSABLE.
 */
const NAV_PILL =
  "inline-flex min-h-11 items-center justify-center rounded-nb-pill border-2 border-ink bg-[var(--store-pill-bg)] text-[var(--store-pill-fg)] shadow-nb-sm " +
  `font-bold text-base md:text-lg ${NB_PRESSABLE}`;

/** Each pill lights up in its own skin colour on hover and keyboard focus. */
const NAV_PILL_TONES = {
  lila: "hover:bg-[var(--store-pill-hover-lila)] focus-visible:bg-[var(--store-pill-hover-lila)]",
  menta: "hover:bg-[var(--store-pill-hover-menta)] focus-visible:bg-[var(--store-pill-hover-menta)]",
  rosa: "hover:bg-[var(--store-pill-hover-rosa)] focus-visible:bg-[var(--store-pill-hover-rosa)]",
} as const;

type NavPillTone = keyof typeof NAV_PILL_TONES;

const NAV_PILL_CURRENT = "aria-[current=page]:bg-[var(--store-pill-current-bg)]";

export type { NavPillTone };
export { NAV_PILL, NAV_PILL_CURRENT, NAV_PILL_TONES };
