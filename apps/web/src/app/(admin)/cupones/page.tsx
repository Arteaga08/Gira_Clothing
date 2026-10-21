import type { Metadata } from "next";
import { CouponsPage } from "@/components/coupons/CouponsPage";
import { SectionError } from "@/components/resumen/SectionError";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { parseCouponFilters, parseSelectedCoupon } from "@/lib/coupons/filters";

const metadata: Metadata = { title: "Cupones" };

const RENDER_CRASH_MESSAGE = "Esta sección no se pudo mostrar. Actualiza la página para reintentar.";

interface CuponesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Filters and the open coupon live in the URL, so a view can be shared or
 * reloaded. The list itself loads in the client (it refreshes after the
 * operator's own actions); this server component only parses the query string
 * and passes plain data down.
 */
const CuponesPage = async ({ searchParams }: CuponesPageProps) => {
  const params = await searchParams;
  return (
    <ErrorBoundary fallback={<SectionError message={RENDER_CRASH_MESSAGE} />}>
      <CouponsPage initialFilters={parseCouponFilters(params)} initialSelected={parseSelectedCoupon(params)} />
    </ErrorBoundary>
  );
};

export { metadata };
export default CuponesPage;
