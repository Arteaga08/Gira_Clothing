import type { Metadata } from "next";
import { ProductEditor } from "@/components/catalog/ProductEditor";
import { SectionError } from "@/components/resumen/SectionError";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { PageHeader } from "@/components/ui/PageHeader";

const metadata: Metadata = { title: "Nuevo producto" };

const RENDER_CRASH_MESSAGE = "Esta sección no se pudo mostrar. Actualiza la página para reintentar.";

const NuevoProductoPage = () => (
  <div className="flex flex-col gap-6">
    <PageHeader title="Nuevo producto" subtitle="Un modelo y las estampas con las que se vende." />
    <ErrorBoundary fallback={<SectionError message={RENDER_CRASH_MESSAGE} />}>
      <ProductEditor productId={null} />
    </ErrorBoundary>
  </div>
);

export { metadata };
export default NuevoProductoPage;
