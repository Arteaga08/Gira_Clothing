import type { Metadata } from "next";
import { PrintsPage } from "@/components/prints/PrintsPage";
import { SectionError } from "@/components/resumen/SectionError";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { parsePrintFilters, parseSelectedPrint } from "@/lib/prints/filters";

const metadata: Metadata = { title: "Estampas" };

const RENDER_CRASH_MESSAGE = "Esta sección no se pudo mostrar. Actualiza la página para reintentar.";

interface EstampasPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Filters and the open print live in the URL, so a view can be shared or
 * reloaded. The list itself loads in the client (it refreshes after the
 * operator's own actions); this server component only parses the query string.
 */
const EstampasPage = async ({ searchParams }: EstampasPageProps) => {
  const params = await searchParams;
  return (
    <ErrorBoundary fallback={<SectionError message={RENDER_CRASH_MESSAGE} />}>
      <PrintsPage initialFilters={parsePrintFilters(params)} initialSelected={parseSelectedPrint(params)} />
    </ErrorBoundary>
  );
};

export { metadata };
export default EstampasPage;
