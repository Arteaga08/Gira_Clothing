import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderDetail } from "@/components/orders/detail/OrderDetail";
import { SectionError } from "@/components/resumen/SectionError";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { PageHeader } from "@/components/ui/PageHeader";
import { getOrder } from "@/lib/api/adminOrdersServer";
import { isApiError } from "@/lib/api/ApiError";
import { isOrderId } from "@/lib/orders/orderId";

const metadata: Metadata = { title: "Pedido" };

const GENERIC_ERROR = "No se pudo conectar con el servidor. Intenta de nuevo.";
const RENDER_CRASH_MESSAGE = "Esta sección no se pudo mostrar. Actualiza la página para reintentar.";

interface PedidoPageProps {
  params: Promise<{ id: string }>;
}

/**
 * The route id is the order's internal id (never the publicId, which is a
 * credential). A malformed id is a 404 before any request; a 404 from the API
 * is a 404 here; any other failure renders in place without taking the shell down.
 */
const PedidoPage = async ({ params }: PedidoPageProps) => {
  const { id } = await params;
  if (!isOrderId(id)) notFound();

  let order;
  try {
    order = await getOrder(id);
  } catch (failure) {
    if (isApiError(failure) && failure.status === 404) notFound();
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Pedido" />
        <SectionError message={isApiError(failure) ? failure.message : GENERIC_ERROR} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Pedido" subtitle="Lo que se compró, a dónde va y cómo va el envío." />
      <ErrorBoundary fallback={<SectionError message={RENDER_CRASH_MESSAGE} />}>
        <OrderDetail initialOrder={order} />
      </ErrorBoundary>
    </div>
  );
};

export { metadata };
export default PedidoPage;
