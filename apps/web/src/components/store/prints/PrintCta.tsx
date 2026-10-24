import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { buttonClassName } from "@/components/ui/Button";
import { printRoute } from "@/lib/store/routes";

interface PrintCtaProps {
  slug: string;
  name: string;
}

/**
 * Link to the catalog filtered by this print, in the store's casual voice; the
 * accessible name spells out where it goes. Lila («edit»: navigate): the one
 * yellow button of the page is the hero's.
 */
const PrintCta = ({ slug, name }: PrintCtaProps) => (
  <a href={printRoute(slug)} aria-label={`Ver prendas con la estampa ${name}`} className={buttonClassName("edit", "md", "text-base")}>
    ¡Quiero de esta!
    <ArrowUpRight aria-hidden="true" weight="bold" className="size-5" />
  </a>
);

export { PrintCta };
