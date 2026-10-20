import { OrderStatus } from "@gira/shared";
import { TrayIcon } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/ui/EmptyState";
import type { OrderListFilters } from "@/lib/orders/filters";

const EMPTY_BY_TAB: Record<string, { title: string; description: string }> = {
  [OrderStatus.PENDING_PAYMENT]: { title: "Nada esperando pago", description: "Los pedidos sin pagar aparecen aquí mientras dura su reserva de stock." },
  [OrderStatus.PAID]: { title: "No hay pedidos pagados por atender", description: "Cuando entre un pago, el pedido aparece aquí para pasarlo a en proceso." },
  [OrderStatus.PROCESSING]: { title: "Nada en proceso", description: "Los pedidos que pases a en proceso esperan aquí hasta marcarlos como enviados." },
  [OrderStatus.SHIPPED]: { title: "Nada en camino", description: "Los pedidos enviados aparecen aquí hasta que la paquetería confirme la entrega." },
  [OrderStatus.DELIVERED]: { title: "Aún no hay pedidos recibidos", description: "La paquetería confirma las entregas y el pedido pasa aquí solo." },
  all: { title: "No hay pedidos", description: "Todavía no se ha registrado ningún pedido." },
};

const FILTERED = {
  title: "Ningún pedido coincide",
  description: "Prueba con otro folio o búsqueda, o quita algún filtro.",
};

const hasExtraFilters = (filters: OrderListFilters): boolean =>
  Boolean(filters.orderNumber || filters.search || filters.priority || filters.status);

/** Empty list copy: teaches what the tab is for, or says the filters excluded everything. */
const OrdersEmpty = ({ filters }: { filters: OrderListFilters }) => {
  const copy = hasExtraFilters(filters) ? FILTERED : (EMPTY_BY_TAB[filters.tab] ?? FILTERED);
  return <EmptyState icon={TrayIcon} title={copy.title} description={copy.description} />;
};

export { OrdersEmpty };
