import type { Metadata } from "next";
import { UserRole } from "@gira/shared";
import { CartFlow } from "@/components/store/cart/CartFlow";
import { StorePage } from "@/components/store/pass/StorePage";
import { loadSession } from "@/lib/api/session";

const metadata: Metadata = { title: "Carrito", robots: { index: false, follow: false } };

/** `/carrito`. A customer's cart is read from the account; a visitor's (and a staff member's) from the browser. */
const CartPage = async () => {
  const session = await loadSession();
  const authenticated = session.kind === "authenticated" && session.user.role === UserRole.CUSTOMER;

  return (
    <StorePage title="Tu carrito">
      <CartFlow authenticated={authenticated} />
    </StorePage>
  );
};

export { metadata };
export default CartPage;
