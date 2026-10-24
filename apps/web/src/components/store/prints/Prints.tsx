import { getFeaturedPrints } from "@/lib/api/storefront";
import { PrintsShowcase } from "./PrintsShowcase";

/**
 * «Prints» of the home (M13 section 5): the prints the team placed in the home
 * (Estampas screen, «Posición en la home»), in slot order. Read-only here. No
 * placed prints, no section.
 */
const Prints = async () => {
  const prints = await getFeaturedPrints();
  if (prints.length === 0) return null;
  return <PrintsShowcase prints={prints} />;
};

export { Prints };
