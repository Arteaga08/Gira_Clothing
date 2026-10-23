import type { Metadata } from "next";
import { SectionError } from "@/components/resumen/SectionError";
import { HomeContentPage } from "@/components/home-content/HomeContentPage";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

const metadata: Metadata = { title: "Contenido de home" };

const RENDER_CRASH_MESSAGE = "Esta sección no se pudo mostrar. Actualiza la página para reintentar.";

const ContenidoHomePage = () => (
  <ErrorBoundary fallback={<SectionError message={RENDER_CRASH_MESSAGE} />}>
    <HomeContentPage />
  </ErrorBoundary>
);

export { metadata };
export default ContenidoHomePage;
