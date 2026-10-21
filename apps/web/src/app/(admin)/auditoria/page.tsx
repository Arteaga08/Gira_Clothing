import type { Metadata } from "next";
import { AuditPage } from "@/components/audit/AuditPage";
import { SectionError } from "@/components/resumen/SectionError";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { parseAuditFilters, parseSelectedEntry } from "@/lib/audit/filters";

const metadata: Metadata = { title: "Auditoría" };

const RENDER_CRASH_MESSAGE = "Esta sección no se pudo mostrar. Actualiza la página para reintentar.";

interface AuditoriaPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** The trail loads in the client; this server component only parses the query string and passes plain data down. */
const AuditoriaPage = async ({ searchParams }: AuditoriaPageProps) => {
  const params = await searchParams;
  return (
    <ErrorBoundary fallback={<SectionError message={RENDER_CRASH_MESSAGE} />}>
      <AuditPage initialFilters={parseAuditFilters(params)} initialSelected={parseSelectedEntry(params)} />
    </ErrorBoundary>
  );
};

export { metadata };
export default AuditoriaPage;
