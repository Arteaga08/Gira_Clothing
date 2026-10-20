import type { Metadata } from "next";
import { InventoryPage } from "@/components/inventory/InventoryPage";
import { SectionError } from "@/components/resumen/SectionError";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { PageHeader } from "@/components/ui/PageHeader";
import { getInventoryCounts } from "@/lib/api/adminVariantsServer";
import { parseInventoryFilters } from "@/lib/inventory/filters";
import type { InventoryCounts } from "@/lib/inventory/stats";

const metadata: Metadata = { title: "Inventario" };

const RENDER_CRASH_MESSAGE = "Esta sección no se pudo mostrar. Actualiza la página para reintentar.";

interface InventarioPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** A failed read only costs the tab numbers and the low-stock badge: the client retries it, the list still loads. */
const readCounts = async (): Promise<InventoryCounts | null> => {
  try {
    return await getInventoryCounts();
  } catch {
    return null;
  }
};

/**
 * Filters live in the URL, so a filtered view can be shared or reloaded. The
 * list itself loads in the client (it refreshes after every adjustment); this
 * server component parses the query string and reads the counts once.
 */
const InventarioPage = async ({ searchParams }: InventarioPageProps) => {
  const [params, initialCounts] = await Promise.all([searchParams, readCounts()]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Inventario" subtitle="Existencias por variante (modelo × print), agrupadas por categoría." />
      <ErrorBoundary fallback={<SectionError message={RENDER_CRASH_MESSAGE} />}>
        <InventoryPage initialFilters={parseInventoryFilters(params)} initialCounts={initialCounts} />
      </ErrorBoundary>
    </div>
  );
};

export { metadata };
export default InventarioPage;
