import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingBagOpen } from "@phosphor-icons/react/dist/ssr";
import { CartLineStatus } from "@gira/shared";
import { CheckoutFlow } from "@/components/store/checkout/CheckoutFlow";
import { PendingOrderCard } from "@/components/store/checkout/PendingOrderCard";
import { StorePage } from "@/components/store/pass/StorePage";
import { LoadFailure } from "@/components/store/account/shell/LoadFailure";
import { buttonClassName } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { getAccount, getPendingOrder } from "@/lib/api/accountServer";
import { getCart } from "@/lib/api/cartServer";
import { requireCustomer } from "@/lib/account/requireCustomer";
import { STORE_ROUTES } from "@/lib/store/routes";

const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };

const PLAIN_CARD = "rounded-nb border-2 border-ink bg-surface text-text-primary shadow-nb-lg";

/** `/checkout`: only for a signed-in customer. A pending order replaces the form; an empty or blocked cart sends back to the cart. */
const CheckoutPage = async () => {
  const guard = await requireCustomer(STORE_ROUTES.checkout);
  if (guard.kind === "unavailable") {
    return (
      <StorePage title="Checkout">
        <div className={PLAIN_CARD}>
          <LoadFailure what="el pago" />
        </div>
      </StorePage>
    );
  }

  const [pending, account, cart] = await Promise.all([getPendingOrder(), getAccount(), getCart()]);
  if (pending.status === "error" || account.status === "error" || cart.status === "error") {
    return (
      <StorePage title="Checkout">
        <div className={PLAIN_CARD}>
          <LoadFailure what="el pago" />
        </div>
      </StorePage>
    );
  }

  if (pending.order) {
    return (
      <StorePage title="Tu pedido pendiente">
        <PendingOrderCard order={pending.order} />
      </StorePage>
    );
  }

  const { lines } = cart.cart;
  const blocked = lines.some((line) => line.status !== CartLineStatus.AVAILABLE);
  if (lines.length === 0 || blocked) {
    return (
      <StorePage title="Checkout">
        <div className={PLAIN_CARD}>
          <EmptyState
            icon={ShoppingBagOpen}
            title={lines.length === 0 ? "Tu carrito está vacío" : "Revisa tu carrito antes de pagar"}
            description={lines.length === 0 ? "Agrega algo para poder pagar." : "Hay artículos que ya no se pueden comprar. Quítalos y vuelve aquí."}
            action={
              <Link href={lines.length === 0 ? STORE_ROUTES.shop : STORE_ROUTES.cart} className={buttonClassName("primary")}>
                {lines.length === 0 ? "Ir a la tienda" : "Volver al carrito"}
              </Link>
            }
          />
        </div>
      </StorePage>
    );
  }

  return (
    <StorePage title="Checkout">
      <CheckoutFlow lines={lines} addresses={account.account.addresses} />
    </StorePage>
  );
};

export { metadata };
export default CheckoutPage;
