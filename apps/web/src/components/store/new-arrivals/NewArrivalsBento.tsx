"use client";

import { ArrowUpRight } from "@phosphor-icons/react";
import type { PublicProductSummary } from "@gira/shared";
import { buttonClassName } from "@/components/ui/Button";
import { useRevealOnScroll } from "@/components/store/best-sellers/useRevealOnScroll";
import { STORE_ROUTES } from "@/lib/store/routes";
import { NewArrivalTile } from "./NewArrivalTile";

interface NewArrivalsBentoProps {
  products: PublicProductSummary[];
  authenticated: boolean;
}

/**
 * Title, line and link of the section, then the bento: the newest product
 * large, the rest sharing the other half. It sits on a bone band whose top is
 * cut with clouds (store-skin.css); the bento rearranges itself for 1 to 5.
 */
const NewArrivalsBento = ({ products, authenticated }: NewArrivalsBentoProps) => {
  const { ref, state } = useRevealOnScroll<HTMLElement>();

  return (
    <section
      ref={ref}
      data-reveal={state}
      aria-labelledby="new-arrivals-title"
      className="store-reveal store-band-bone store-cut store-cut-nubes"
    >
      <div className="mx-auto w-full max-w-[96rem] px-4 py-16 md:px-8 md:py-28">
        <header className="mb-10 flex flex-wrap items-end justify-between gap-x-12 gap-y-6 md:mb-16">
          <h2
            id="new-arrivals-title"
            style={{ ["--i" as string]: 0 }}
            className="reveal-item font-display text-[clamp(3.5rem,8.4vw,8.25rem)] uppercase leading-[0.9]"
          >
            Recién
            <br />
            salido
          </h2>
          <div style={{ ["--i" as string]: 1 }} className="reveal-item flex max-w-[34ch] flex-col items-start gap-5">
            <p className="text-lg leading-normal">Lo último que salió del taller, todavía con la etiqueta puesta.</p>
            <a href={STORE_ROUTES.newArrivals} className={buttonClassName("edit", "md", "text-base")}>
              Ver todas las novedades
              <ArrowUpRight aria-hidden="true" weight="bold" className="size-5" />
            </a>
          </div>
        </header>
        <div className="new-bento" data-count={products.length}>
          {products.map((product, index) => (
            <NewArrivalTile key={product.id} product={product} authenticated={authenticated} lead={index === 0} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
};

export type { NewArrivalsBentoProps };
export { NewArrivalsBento };
