import { Currency, type RevenueEntry, type Wire } from "@gira/shared";
import { CurrencyDollarIcon, PackageIcon, ShoppingBagOpenIcon } from "@phosphor-icons/react/dist/ssr";
import { StatCard } from "@/components/ui/StatCard";
import { formatInteger, formatMoneyParts } from "@/lib/format";

interface KpiRowOrders {
  totalOrders: number;
  paidOrders: number;
  revenue: Wire<RevenueEntry>[];
  unitsSold: number;
}

interface KpiRowProps {
  orders: KpiRowOrders;
  inventory: { unitsAvailable: number };
}

/**
 * Revenue is grouped by currency and never summed (orderStatsService.ts) —
 * two KPIs, never a total. A currency absent from `revenue[]` still renders
 * a card at zero so the row never changes shape between ranges.
 */
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
  const mxnParts = formatMoneyParts(mxn.revenue, Currency.MXN);
  const usdParts = formatMoneyParts(usd.revenue, Currency.USD);

  return (
    <section aria-label="Indicadores del periodo">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4">
        <StatCard
          label="Pedidos"
          value={formatInteger(orders.totalOrders)}
          foot={`${formatInteger(orders.paidOrders)} con pago confirmado`}
          icon={ShoppingBagOpenIcon}
        />
        <StatCard
          label="Ingresos MXN"
          value={mxnParts.amount}
          unit={mxnParts.fraction}
          foot={`${formatInteger(mxn.orders)} pedidos`}
          icon={CurrencyDollarIcon}
          accent
        />
        <StatCard
          label="Ingresos USD"
          value={usdParts.amount}
          unit={usdParts.fraction}
          foot={`${formatInteger(usd.orders)} pedidos`}
          icon={CurrencyDollarIcon}
        />
        <StatCard
          label="Unidades vendidas"
          value={formatInteger(orders.unitsSold)}
          foot={`${formatInteger(inventory.unitsAvailable)} disponibles en inventario`}
          icon={PackageIcon}
        />
      </div>
      <p className="mt-3 text-xs text-text-muted">
        Los ingresos se muestran por moneda: MXN y USD nunca se suman.
      </p>
    </section>
  );
};

export { KpiRow };
export type { KpiRowProps };
