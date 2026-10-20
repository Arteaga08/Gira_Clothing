import type { Metadata } from "next";
import { NewProductButton } from "@/components/catalog/NewProductButton";
import { ProductsPage } from "@/components/catalog/ProductsPage";
import { SectionError } from "@/components/resumen/SectionError";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { PageHeader } from "@/components/ui/PageHeader";
import { parseCatalogFilters } from "@/lib/catalog/filters";

const metadata: Metadata = { title: "Productos" };

const RENDER_CRASH_MESSAGE = "Esta sección no se pudo mostrar. Actualiza la página para reintentar.";

interface ProductosPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Filters live in the URL, so a filtered view can be shared or reloaded. The
 * list itself loads in the client (it refreshes after the operator's own
 * actions); this server component only parses the query string.
 */
const ProductosPage = async ({ searchParams }: ProductosPageProps) => {
  const params = await searchParams;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Productos"
        subtitle="Modelos del catálogo, agrupados por categoría."
        actions={<NewProductButton />}
      />
      <ErrorBoundary fallback={<SectionError message={RENDER_CRASH_MESSAGE} />}>
        <ProductsPage initialFilters={parseCatalogFilters(params)} />
      </ErrorBoundary>
    </div>
  );
};

export { metadata };
export default ProductosPage;
