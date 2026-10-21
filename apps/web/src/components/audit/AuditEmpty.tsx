import { ClipboardTextIcon, MagnifyingGlassIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { hasActiveFilters, type AuditFilters } from "@/lib/audit/filters";

interface AuditEmptyProps {
  filters: AuditFilters;
  onClear: () => void;
}

/** "Nothing matches" offers a way out; "nothing yet" explains what will show up here. */
const AuditEmpty = ({ filters, onClear }: AuditEmptyProps) =>
  hasActiveFilters(filters) ? (
    <EmptyState
      icon={MagnifyingGlassIcon}
      title="Ningún registro coincide"
      description="Prueba con otro módulo, con «Todos» en Quién o con un periodo más largo."
      action={
        <Button size="sm" onClick={onClear}>
          Limpiar filtros
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={ClipboardTextIcon}
      title="Sin actividad en los últimos 30 días"
      description="Aquí aparece lo que hacen los administradores y el sistema: cambios de pedidos, catálogo, inventario, cupones y ajustes."
    />
  );

export type { AuditEmptyProps };
export { AuditEmpty };
