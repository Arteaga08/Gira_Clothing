import { Notice } from "@/components/ui/Notice";

interface SectionErrorProps {
  message: string;
}

/**
 * Renders in place of a section whose own fetch failed — the page uses
 * `Promise.allSettled` so one down endpoint never blanks the whole screen.
 * No retry button: that would be a Client Component for a single
 * `location.reload()`, and the TopBar's "Actualizar datos" already covers it.
 */
const SectionError = ({ message }: SectionErrorProps) => (
  <Notice variant="danger" title="No se pudo cargar esta sección">
    {message}
  </Notice>
);

export { SectionError };
export type { SectionErrorProps };
