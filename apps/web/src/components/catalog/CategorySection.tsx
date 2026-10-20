import { useId } from "react";
import { T_SECTION_TITLE } from "@/components/ui/typography";
import type { ProductGroup } from "@/lib/catalog/groupByCategory";
import { ProductCard } from "./ProductCard";

interface CategorySectionProps {
  group: ProductGroup;
}

const modelsLabel = (count: number): string => (count === 1 ? "1 modelo" : `${count} modelos`);

/** A category's heading (on the green page, so inverse text) and its grid of cards. The count describes the loaded page only. */
const CategorySection = ({ group }: CategorySectionProps) => {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <div className="mb-3 flex items-baseline gap-3">
        <h2 id={headingId} className={T_SECTION_TITLE}>
          {group.name}
        </h2>
        <span className="font-mono text-xs text-text-inverse-secondary">{modelsLabel(group.products.length)}</span>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]">
        {group.products.map((product) => (
          <li key={product.id}>
            <ProductCard product={product} />
          </li>
        ))}
      </ul>
    </section>
  );
};

export type { CategorySectionProps };
export { CategorySection };
