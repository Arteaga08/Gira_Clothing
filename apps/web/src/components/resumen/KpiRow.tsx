import { Currency, type RevenueEntry, type Wire } from "@gira/shared";
import { CurrencyDollarIcon, PackageIcon, ShoppingBagOpenIcon } from "@phosphor-icons/react/dist/ssr";
import { StatCard } from "@/components/ui/StatCard";
import { formatInteger, formatMoneyParts } from "@/lib/format";

interface KpiRowOrders {
  totalOrders: number;
  paidOrders: number;
  revenue: Wire<RevenueEntry>[];
  /** Every order's `total` converted to MXN with ITS OWN frozen exchange
   *  rate, MXN orders passed through unchanged — the dashboard's ONLY
   *  revenue figure. `revenue` keeps the untouched per-currency breakdown
   *  for other consumers, but this card never names a second currency. */
  totalMxnEquivalent: number;
  unitsSold: number;
}

interface KpiRowProps {
  orders: KpiRowOrders;
  inventory: { unitsAvailable: number };
}

/** Total orders that contributed revenue in the period, across every
 *  currency — a single count, never broken out by currency on this card. */
const revenueOrderCount = (revenue: KpiRowOrders["revenue"]): number =>
  revenue.reduce((sum, entry) => sum + entry.orders, 0);

const KpiRow = ({ orders, inventory }: KpiRowProps) => {
  const equivalentParts = formatMoneyParts(orders.totalMxnEquivalent, Currency.MXN);

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
          label="Ingresos"
          value={equivalentParts.amount}
          unit={equivalentParts.fraction}
          foot={`${formatInteger(revenueOrderCount(orders.revenue))} pedidos`}
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
        El monto se muestra en pesos; una compra en otra moneda se convierte con la tasa vigente al
        momento del pedido.
      </p>
    </section>
  );
};

export { KpiRow };
export type { KpiRowProps };
