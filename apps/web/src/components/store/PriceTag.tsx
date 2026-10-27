import { formatPesos } from "@/lib/catalog/money";
import { cn } from "@/lib/cn";

interface PriceTagProps {
  /** MXN centavos the unit costs now. */
  price: number;
  /** MXN centavos to strike through; present only while on sale (the API decides). */
  compareAtPrice?: number | undefined;
  /** Classes of the current price. */
  className?: string;
}

/** The current price in mono; while on sale, the previous one struck through beside it. */
const PriceTag = ({ price, compareAtPrice, className }: PriceTagProps) => (
  <span className="inline-flex flex-wrap items-baseline gap-x-2">
    <span className={cn("font-mono font-bold", className)}>{formatPesos(price)}</span>
    {compareAtPrice !== undefined ? (
      <s className="font-mono text-sm text-text-secondary">
        <span className="sr-only">Antes </span>
        {formatPesos(compareAtPrice)}
      </s>
    ) : null}
  </span>
);

export type { PriceTagProps };
export { PriceTag };
