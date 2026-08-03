import type { TopProduct, Wire } from "@gira/shared";
import { formatInteger } from "@/lib/format";

interface TopProductsBarChartProps {
  products: readonly Wire<TopProduct>[];
}

const ZERO_BAR_PERCENT = 6;

/** One bar per top product — same neobrutalist treatment as `TimeseriesChart`
 *  (solid ink border, no gradient), oriented by product instead of by day. */
const TopProductsBarChart = ({ products }: TopProductsBarChartProps) => {
  const values = products.map((p) => p.units);
  const max = values.length > 0 ? Math.max(...values) : 0;
  const total = values.reduce((sum, value) => sum + value, 0);
  const ariaLabel = `Unidades vendidas por producto. Total ${total}, máximo ${max}.`;

  return (
    <div className="overflow-x-auto">
      <div role="img" aria-label={ariaLabel} className="flex h-40 items-end gap-3 pt-2">
        {products.map((product) => {
          const heightPercent =
            max > 0 ? Math.max(Math.round((product.units / max) * 100), ZERO_BAR_PERCENT) : ZERO_BAR_PERCENT;
          return (
            <div key={product.sku} className="flex min-w-[64px] flex-1 flex-col items-center gap-1.5">
              <span className="font-mono text-xs font-bold">{formatInteger(product.units)}</span>
              <span
                data-bar
                style={{ height: `${heightPercent}%` }}
                className="w-full max-w-10 rounded-t-[4px] border-[1.5px] border-ink bg-brand"
              />
              <span className="w-full truncate text-center text-[10px] text-text-muted">
                {product.productName}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export { TopProductsBarChart };
export type { TopProductsBarChartProps };
