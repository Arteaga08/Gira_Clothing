
import { T_DATA, T_LABEL, T_PANEL_TITLE } from "@/components/ui/typography";
import { formatMoney } from "@/lib/orders/money";
import type { PanelOrder } from "@/lib/orders/panelOrder";

type OrderLinesProps = Pick<PanelOrder, "lines" | "currency">;

/** The immutable snapshot taken at purchase: rendered as-is, with no catalog lookups. */
const OrderLines = ({ lines, currency }: OrderLinesProps) => (
  <section aria-labelledby="order-lines-title">
    <h3 id="order-lines-title" className={T_PANEL_TITLE}>
      Artículos
    </h3>
    <ul className="mt-3">
      {lines.map((line) => (
        <li
          key={line.sku}
          className="grid grid-cols-[48px_1fr_auto_auto] items-center gap-4 border-b border-border py-3 last:border-b-0"
        >
          {line.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL from the order snapshot (Cloudinary); no next/image loader is configured
            <img
              src={line.image.url}
              alt={`${line.productName} · ${line.printName}`}
              width={48}
              height={48}
              loading="lazy"
              className="h-12 w-12 rounded-nb-sm border-2 border-ink object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className={`${T_LABEL} grid h-12 w-12 place-items-center rounded-nb-sm border-2 border-ink bg-surface-sunken text-text-muted`}
            >
              IMG
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">
              {line.productName} · {line.printName}
            </p>
            <p className="font-mono text-2xs text-text-muted">
              {line.sku} · {formatMoney(line.unitPrice, currency)} c/u
            </p>
          </div>
          <span className={T_DATA}>×{line.qty}</span>
          <span className={T_DATA}>{formatMoney(line.lineTotal, currency)}</span>
        </li>
      ))}
    </ul>
  </section>
);

export type { OrderLinesProps };
export { OrderLines };
