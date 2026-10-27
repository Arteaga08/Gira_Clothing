import type { CSSProperties } from "react";
import type { CategoryColor, ImageAttrs } from "@gira/shared";
import { CATEGORY_TONE } from "@/lib/store/categoryColors";
import { cn } from "@/lib/cn";
import { sizeImageUrl } from "./sizeImage";

interface ProductDimensionsProps {
  image: ImageAttrs;
  color: CategoryColor;
  productName: string;
}

const DIMENSIONS_WIDTH = 1200;

/** «Dimensiones»: the photo of the model's real size on a band in the category's colour; its cut takes the same fill. */
const ProductDimensions = ({ image, color, productName }: ProductDimensionsProps) => (
  <section
    aria-labelledby="product-dimensions"
    style={{ "--cut-fill": `var(--color-cat-${color})` } as CSSProperties}
    className={cn("store-cut store-cut-cupon py-16 text-text-primary md:py-24", CATEGORY_TONE[color].strong)}
  >
    <div className="mx-auto grid w-full max-w-[56rem] gap-8 px-4 md:gap-10 md:px-8">
      <h2 id="product-dimensions" className="font-display text-[clamp(2.25rem,4.4vw,4rem)] uppercase leading-[0.95]">
        Dimensiones
      </h2>
      <div className="overflow-hidden rounded-nb border-2 border-ink bg-surface p-4 shadow-nb-lg md:p-6">
        {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary URL from the API; no next/image loader is configured */}
        <img
          src={sizeImageUrl(image.url, DIMENSIONS_WIDTH)}
          alt={`Medidas de ${productName}`}
          loading="lazy"
          decoding="async"
          className="h-auto w-full object-contain"
        />
      </div>
    </div>
  </section>
);

export type { ProductDimensionsProps };
export { ProductDimensions };
