import { NB_SURFACE_CHROME } from "@/components/ui/styles";

/**
 * Chrome of a TINTED surface (podium places, the customer profile). It is NB_SURFACE without
 * its `bg-surface`: both fills would be the same specificity and the one later in the
 * stylesheet wins, so a tint composed on top of NB_SURFACE does not always show.
 */
const NB_TILE = `${NB_SURFACE_CHROME} text-text-primary`;

export { NB_TILE };
