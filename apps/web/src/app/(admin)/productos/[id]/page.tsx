import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductEditor } from "@/components/catalog/ProductEditor";
import { SectionError } from "@/components/resumen/SectionError";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { PageHeader } from "@/components/ui/PageHeader";
import { isProductId } from "@/lib/catalog/productId";

const metadata: Metadata = { title: "Editar producto" };

const RENDER_CRASH_MESSAGE = "Esta sección no se pudo mostrar. Actualiza la página para reintentar.";

interface EditarProductoPageProps {
  params: Promise<{ id: string }>;
}

/** The id comes from the URL: anything that is not an id is a 404 before the client asks the API for it. */
const EditarProductoPage = async ({ params }: EditarProductoPageProps) => {
  const { id } = await params;
  if (!isProductId(id)) notFound();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Editar producto" subtitle="Datos del modelo, estampas y fotos." />
      <ErrorBoundary fallback={<SectionError message={RENDER_CRASH_MESSAGE} />}>
        <ProductEditor productId={id} />
      </ErrorBoundary>
    </div>
  );
};

export { metadata };
export default EditarProductoPage;
