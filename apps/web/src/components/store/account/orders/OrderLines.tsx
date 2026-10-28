import type { CustomerOrder, Wire } from "@gira/shared";
import { cardImageUrl } from "@/components/store/best-sellers/cardImage";
import { T_PANEL_TITLE } from "@/components/ui/typography";
import { formatMoney } from "@/lib/orders/money";

const THUMB_WIDTH = 160;

const TotalRow = ({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) => (
  <div className={strong ? "flex justify-between gap-3 border-t-2 border-ink pt-2 text-base font-bold" : "flex justify-between gap-3"}>
    <dt className={strong ? undefined : "text-text-secondary"}>{label}</dt>
    <dd className="m-0 font-mono">{value}</dd>
  </div>
);

/** «Productos» of an order: each line with its photo, and the totals as they were charged. */
const OrderLines = ({ order }: { order: Wire<CustomerOrder> }) => {
  const money = (cents: number) => formatMoney(cents, order.currency);

  return (
    <section aria-labelledby="order-lines-title">
      <h2 id="order-lines-title" className={`${T_PANEL_TITLE} mb-3 text-2xl`}>
        Productos
      </h2>
      <ul className="divide-y-2 divide-dashed divide-border">
        {order.lines.map((line, index) => (
          <li key={`${line.sku}-${String(index)}`} className="flex items-center gap-3 py-3">
            <span className="block size-14 shrink-0 overflow-hidden rounded-nb-sm border-2 border-ink bg-tile-alt">
              {line.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- Cloudinary URL from the API; no next/image loader is configured
                <img src={cardImageUrl(line.image.url, THUMB_WIDTH)} alt="" width={THUMB_WIDTH} height={200} loading="lazy" decoding="async" className="size-full object-cover" />
              ) : null}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{line.productName}</p>
              <p className="truncate text-xs text-text-secondary">{`${line.printName}. Cantidad: ${String(line.qty)}`}</p>
            </div>
            <span className="font-mono text-sm font-bold">{money(line.lineTotal)}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-3 grid gap-1.5 border-t-2 border-ink pt-3 text-sm sm:ml-auto sm:max-w-xs">
        <TotalRow label="Subtotal" value={money(order.subtotal)} />
        {order.discount > 0 ? <TotalRow label="Descuento" value={`-${money(order.discount)}`} /> : null}
        <TotalRow label="Envío" value={order.shippingCost === 0 ? "Gratis" : money(order.shippingCost)} />
        <TotalRow label="Total" value={money(order.total)} strong />
      </dl>
      <p className="mt-2 text-xs text-text-muted sm:text-right">IVA incluido</p>
    </section>
  );
};

export { OrderLines };
