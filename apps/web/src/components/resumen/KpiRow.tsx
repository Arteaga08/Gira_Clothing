import { Currency, type RevenueEntry, type Wire } from "@gira/shared";
import { CurrencyDollarIcon, PackageIcon, ShoppingBagOpenIcon } from "@phosphor-icons/react/dist/ssr";
import { StatCard } from "@/components/ui/StatCard";
import { formatInteger, formatMoneyParts } from "@/lib/format";

interface KpiRowOrders {
  totalOrders: number;
  paidOrders: number;
  revenue: Wire<RevenueEntry>[];
  /** Every order's `total` converted to MXN with ITS OWN frozen exchange
   *  rate, MXN orders passed through unchanged — the dashboard's headline
   *  figure. `revenue` above stays the untouched, per-currency breakdown. */
  totalMxnEquivalent: number;
  unitsSold: number;
}

interface KpiRowProps {
  orders: KpiRowOrders;
  inventory: { unitsAvailable: number };
}

const revenueFor = (
  revenue: KpiRowOrders["revenue"],
  currency: Currency,
): { revenue: number; orders: number } => {
  const entry = revenue.find((item) => item.currency === currency);
  return { revenue: entry?.revenue ?? 0, orders: entry?.orders ?? 0 };
};

const KpiRow = ({ orders, inventory }: KpiRowProps) => {
  const mxn = revenueFor(orders.revenue, Currency.MXN);
  const usd = revenueFor(orders.revenue, Currency.USD);
  const equivalentParts = formatMoneyParts(orders.totalMxnEquivalent, Currency.MXN);
  const mxnParts = formatMoneyParts(mxn.revenue, Currency.MXN);
  // Never re-derived from a rate here: the API already did the conversion
  // per order, so the USD-equivalent shown is just what's left after
  // subtracting the real MXN portion from the already-computed total.
  const usdEquivalentParts = formatMoneyParts(orders.totalMxnEquivalent - mxn.revenue, Currency.MXN);
  const usdParts = formatMoneyParts(usd.revenue, Currency.USD);

  return (
    <section aria-label="Indicadores del periodo">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3 xl:gap-4">
        <StatCard
          label="Pedidos"
          value={formatInteger(orders.totalOrders)}
          foot={`${formatInteger(orders.paidOrders)} con pago confirmado`}
          icon={ShoppingBagOpenIcon}
        />
        <StatCard
          label="Ingresos (equiv. MXN)"
          value={equivalentParts.amount}
          unit={equivalentParts.fraction}
          foot={
            <>
              {mxnParts.amount}
              {mxnParts.fraction} MXN reales · {formatInteger(mxn.orders)} pedidos
              {usd.orders > 0 ? (
                <>
                  <br />
                  <span className="opacity-80">
                    + USD {usdParts.amount}
                    {usdParts.fraction} · {formatInteger(usd.orders)} pedidos (equiv.{" "}
                    {usdEquivalentParts.amount}
                    {usdEquivalentParts.fraction} MXN)
                  </span>
                </>
              ) : null}
            </>
          }
          icon={CurrencyDollarIcon}
          accent
        />
        <StatCard
          label="Unidades vendidas"
          value={formatInteger(orders.unitsSold)}
          foot={`${formatInteger(inventory.unitsAvailable)} disponibles en inventario`}
          icon={PackageIcon}
        />
      </div>
      <p className="mt-3 text-xs text-text-muted">
        El equivalente en MXN usa la tasa de cambio congelada de cada pedido, nunca la actual; el
        desglose real por moneda va en la tarjeta.
      </p>
    </section>
  );
};

export { KpiRow };
export type { KpiRowProps };
