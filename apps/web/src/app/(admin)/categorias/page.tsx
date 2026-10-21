import type { Metadata } from "next";
import { SectionError } from "@/components/resumen/SectionError";
import { TaxonomyPage } from "@/components/taxonomy/TaxonomyPage";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { categoryConfig } from "@/lib/taxonomy/config";
import { parseSelectedTaxon, parseTaxonFilters } from "@/lib/taxonomy/filters";

const metadata: Metadata = { title: "Categorías" };

const RENDER_CRASH_MESSAGE = "Esta sección no se pudo mostrar. Actualiza la página para reintentar.";

interface CategoriasPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Filters and the open record live in the URL, so a view can be shared or
 * reloaded. The list itself loads in the client (it refreshes after the
 * operator's own actions); this server component only parses the query string.
 */
const CategoriasPage = async ({ searchParams }: CategoriasPageProps) => {
  const params = await searchParams;
  return (
    <ErrorBoundary fallback={<SectionError message={RENDER_CRASH_MESSAGE} />}>
      <TaxonomyPage
        kind="category"
        initialFilters={parseTaxonFilters(params)}
        initialSelected={parseSelectedTaxon(params, categoryConfig.param)}
      />
    </ErrorBoundary>
  );
};

export { metadata };
export default CategoriasPage;
