import type { Metadata } from "next";
import { CustomersPage } from "@/components/customers/CustomersPage";
import { SectionError } from "@/components/resumen/SectionError";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { parseCustomerFilters } from "@/lib/customers/filters";

const metadata: Metadata = { title: "Clientes" };

const RENDER_CRASH_MESSAGE = "Esta sección no se pudo mostrar. Actualiza la página para reintentar.";

interface ClientesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Filters live in the URL; the lists load in the client. This only parses the query string and passes plain data. */
const ClientesPage = async ({ searchParams }: ClientesPageProps) => {
  const params = await searchParams;
  return (
    <ErrorBoundary fallback={<SectionError message={RENDER_CRASH_MESSAGE} />}>
      <CustomersPage initialFilters={parseCustomerFilters(params)} />
    </ErrorBoundary>
  );
};

export { metadata };
export default ClientesPage;
