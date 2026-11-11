import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LoadFailure } from "@/components/store/account/shell/LoadFailure";
import { OrderResult } from "@/components/store/order/OrderResult";
import { StorePage } from "@/components/store/pass/StorePage";
import { getPublicOrder } from "@/lib/api/orderServer";

// The id in the URL is the access to the order: it must not travel in a Referer, nor be indexed or cached.
const metadata: Metadata = { title: "Tu pedido", robots: { index: false, follow: false }, referrer: "no-referrer" };

interface OrderPageProps {
  params: Promise<{ publicId: string }>;
}

/** `/orden/[publicId]`: the page Stripe returns to and the emails link to. It reports the order's real status. */
const PublicOrderPage = async ({ params }: OrderPageProps) => {
  const { publicId } = await params;
  const result = await getPublicOrder(publicId);
  if (result.status === "not-found") notFound();

  return (
    <StorePage title="Tu pedido">
      {result.status === "ok" ? (
        <OrderResult order={result.order} />
      ) : (
        <div className="rounded-nb border-2 border-ink bg-surface text-text-primary shadow-nb-lg">
          <LoadFailure what="tu pedido" />
        </div>
      )}
    </StorePage>
  );
};

export { metadata };
export default PublicOrderPage;
