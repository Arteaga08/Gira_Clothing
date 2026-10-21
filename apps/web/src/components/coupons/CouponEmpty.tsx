import { MagnifyingGlassIcon, TicketIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { hasActiveFilters, type CouponFilters } from "@/lib/coupons/filters";
import { NewCouponButton } from "./NewCouponButton";

interface CouponEmptyProps {
  filters: CouponFilters;
  onClear: () => void;
  onCreate: () => void;
}

/** Two different empties: "nothing matches your filters" (with a way out) and "there are none" (with the way in). */
const CouponEmpty = ({ filters, onClear, onCreate }: CouponEmptyProps) =>
  hasActiveFilters(filters) ? (
    <EmptyState
      icon={MagnifyingGlassIcon}
      title="Ningún cupón coincide"
      description="Prueba con otra búsqueda o con el estado «Todos»."
      action={
        <Button size="sm" onClick={onClear}>
          Limpiar filtros
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={TicketIcon}
      title="Aún no hay cupones"
      description="Crea el primero para dar un descuento a tus clientes con cuenta. Podrás retirarlo cuando quieras."
      action={<NewCouponButton variant="secondary" onClick={onCreate} />}
    />
  );

export type { CouponEmptyProps };
export { CouponEmpty };
