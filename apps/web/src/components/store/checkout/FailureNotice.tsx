"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, buttonClassName } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { goToLogin } from "@/lib/account/sessionExpired";
import type { CheckoutFailure, FailureAction } from "@/lib/checkout/checkoutFailures";
import { STORE_ROUTES } from "@/lib/store/routes";

interface FailureHandlers {
  /** The quote is stale: ask for a new one. */
  onRequote?: () => void;
  /** The coupon leaves the order under the minimum: drop it. */
  onRemoveCoupon?: () => void;
}

const TITLES: Record<FailureAction, string> = {
  login: "Tu sesión venció",
  requote: "Vuelve a cotizar tu envío",
  cart: "Revisa tu carrito",
  coupon: "Ese cupón deja tu pedido muy bajo",
  resume: "Tienes un pedido por pagar",
  retry: "No pudimos completar el pago",
  none: "No pudimos crear tu pedido",
};

/** What went wrong with the payment, next to the pay button, with the one thing that fixes it. */
const FailureNotice = ({ failure, handlers = {} }: { failure: CheckoutFailure; handlers?: FailureHandlers }) => {
  const router = useRouter();

  return (
    <Notice variant="danger" title={TITLES[failure.action]}>
      <p>{failure.message}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {failure.action === "login" ? (
          <Button type="button" variant="edit" size="sm" onClick={() => goToLogin(STORE_ROUTES.checkout)}>
            Iniciar sesión
          </Button>
        ) : null}
        {failure.action === "requote" && handlers.onRequote ? (
          <Button type="button" variant="edit" size="sm" onClick={handlers.onRequote}>
            Volver a cotizar
          </Button>
        ) : null}
        {failure.action === "cart" ? (
          <Link href={STORE_ROUTES.cart} className={buttonClassName("edit", "sm")}>
            Volver al carrito
          </Link>
        ) : null}
        {failure.action === "coupon" && handlers.onRemoveCoupon ? (
          <Button type="button" variant="danger" size="sm" onClick={handlers.onRemoveCoupon}>
            Quitar cupón
          </Button>
        ) : null}
        {failure.action === "resume" ? (
          <Button type="button" variant="edit" size="sm" onClick={() => router.refresh()}>
            Ver pedido por pagar
          </Button>
        ) : null}
      </div>
    </Notice>
  );
};

export type { FailureHandlers };
export { FailureNotice };
