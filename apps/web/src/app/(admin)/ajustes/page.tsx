import type { Metadata } from "next";
import { SectionError } from "@/components/resumen/SectionError";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { parseSettingsSection } from "@/lib/settings/sections";

const metadata: Metadata = { title: "Ajustes" };

const RENDER_CRASH_MESSAGE = "Esta sección no se pudo mostrar. Actualiza la página para reintentar.";

interface AjustesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Settings load in the client (each save answers with the whole document); this only reads `?seccion=`. */
const AjustesPage = async ({ searchParams }: AjustesPageProps) => {
  const params = await searchParams;
  return (
    <ErrorBoundary fallback={<SectionError message={RENDER_CRASH_MESSAGE} />}>
      <SettingsPage initialSection={parseSettingsSection(params)} />
    </ErrorBoundary>
  );
};

export { metadata };
export default AjustesPage;
