import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CustomerDetailPage } from "@/components/customers/CustomerDetailPage";
import { SectionError } from "@/components/resumen/SectionError";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { GIVE_COUPON_PARAM } from "@/lib/customers/filters";
import { isObjectId } from "@/lib/inventory/variantId";

const metadata: Metadata = { title: "Cliente" };

const RENDER_CRASH_MESSAGE = "Esta sección no se pudo mostrar. Actualiza la página para reintentar.";

interface ClientePageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** A malformed id is a 404 before any request. The customer loads in the client; only plain data goes down. */
const ClientePage = async ({ params, searchParams }: ClientePageProps) => {
  const { id } = await params;
  if (!isObjectId(id)) notFound();
  const query = await searchParams;
  const raw = query[GIVE_COUPON_PARAM];
  return (
    <ErrorBoundary fallback={<SectionError message={RENDER_CRASH_MESSAGE} />}>
      <CustomerDetailPage customerId={id} initialGiveOpen={(Array.isArray(raw) ? raw[0] : raw) === "nuevo"} />
    </ErrorBoundary>
  );
};

export { metadata };
export default ClientePage;
