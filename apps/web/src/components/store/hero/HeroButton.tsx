import type { HeroButtonColor } from "@gira/shared";
import Link from "next/link";
import { NB_CONTROL_CHROME, NB_PRESSABLE } from "@/components/ui/styles";
import { cn } from "@/lib/cn";
import { BUTTON_FILL } from "@/lib/store/heroColors";
import { productRoute, STORE_ROUTES } from "@/lib/store/routes";

interface HeroButtonProps {
  /** null: the photo has no model (or it was retired) and the button leads to the shop. */
  product: { slug: string; name: string } | null;
  color: HeroButtonColor;
}

/**
 * The one action of the hero. It follows the visible photo: its colour and its
 * model. Ink text on every fill; the fill eases between photos.
 */
const HeroButton = ({ product, color }: HeroButtonProps) => (
  <Link
    href={product ? productRoute(product.slug) : STORE_ROUTES.shop}
    className={cn(
      "inline-flex w-fit items-center justify-center gap-3 px-8 py-4 text-lg font-bold text-text-primary transition-[background-color] duration-500",
      NB_CONTROL_CHROME,
      NB_PRESSABLE,
      BUTTON_FILL[color],
    )}
  >
    {product ? "Ver producto" : "Ver tienda"}
    {product ? <span className="sr-only">: {product.name}</span> : null}
    <span aria-hidden="true">→</span>
  </Link>
);

export type { HeroButtonProps };
export { HeroButton };
