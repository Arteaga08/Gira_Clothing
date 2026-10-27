import { T_LABEL } from "@/components/ui/typography";

interface ProductMaterialsProps {
  materials: string[];
}

/** «Materiales»: one ruled row per material, on a hueso band that cuts into the panel above. */
const ProductMaterials = ({ materials }: ProductMaterialsProps) => (
  <section aria-labelledby="product-materials" className="store-band-bone store-cut store-cut-ola py-16 md:py-24">
    <div className="mx-auto grid w-full max-w-[96rem] gap-8 px-4 md:grid-cols-2 md:gap-16 md:px-8">
      <h2 id="product-materials" className="font-display text-[clamp(2.25rem,4.4vw,4rem)] uppercase leading-[0.95]">
        Materiales
      </h2>
      <ul className="border-t-2 border-ink">
        {materials.map((material) => (
          <li key={material} className="border-b-2 border-ink py-3.5">
            <span className={T_LABEL}>{material}</span>
          </li>
        ))}
      </ul>
    </div>
  </section>
);

export type { ProductMaterialsProps };
export { ProductMaterials };
