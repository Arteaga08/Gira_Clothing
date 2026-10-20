import type { Metadata } from "next";
import { OrdersPage } from "@/components/orders/OrdersPage";
import { SectionError } from "@/components/resumen/SectionError";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { PageHeader } from "@/components/ui/PageHeader";
import { parseOrderFilters } from "@/lib/orders/filters";

const metadata: Metadata = { title: "Pedidos" };

const RENDER_CRASH_MESSAGE = "Esta sección no se pudo mostrar. Actualiza la página para reintentar.";

interface PedidosPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Filters live in the URL, so a filtered list can be shared or reloaded. The
 * list itself loads in the client (it refreshes after every action), so this
 * server component only parses and validates the query string.
 */
const PedidosPage = async ({ searchParams }: PedidosPageProps) => {
  const filters = parseOrderFilters(await searchParams);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Pedidos" subtitle="Elige uno para ver el resumen sin salir de la lista." />
      <ErrorBoundary fallback={<SectionError message={RENDER_CRASH_MESSAGE} />}>
        <OrdersPage initialFilters={filters} />
      </ErrorBoundary>
    </div>
  );
};

export { metadata };
export default PedidosPage;
