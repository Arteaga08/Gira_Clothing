"use client";

import { Check, ShoppingCart } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useCartAdd, type CartAddStatus } from "./useCartAdd";

interface AddToCartButtonProps {
  variantId: string;
  productName: string;
  isAvailable: boolean;
  authenticated: boolean;
}

const LABEL: Record<CartAddStatus, string> = {
  idle: "Agregar",
  adding: "Agregando",
  added: "Agregado",
  full: "Ya tienes el máximo",
  failed: "No se pudo",
};

/**
 * Cart button of a card: menta (it adds, it is not the screen's one primary).
 * Sold out says so and is disabled. The result is announced politely; a failed
 * add carries the API's own reason in the title.
 */
const AddToCartButton = ({ variantId, productName, isAvailable, authenticated }: AddToCartButtonProps) => {
  const { status, message, add } = useCartAdd(variantId, authenticated);

  if (!isAvailable) {
    return (
      <Button variant="positive" size="sm" disabled aria-label={`${productName}, agotado`}>
        Agotado ):
      </Button>
    );
  }

  return (
    <>
      <Button
        variant="positive"
        size="sm"
        loading={status === "adding"}
        onClick={() => void add()}
        title={status === "failed" && message ? message : undefined}
        aria-label={`Agregar ${productName} al carrito`}
        className="min-w-[7.25rem]"
      >
        {status === "added" ? <Icon icon={Check} /> : status === "idle" ? <Icon icon={ShoppingCart} /> : null}
        {LABEL[status]}
      </Button>
      <span role="status" className="sr-only">
        {status === "added" ? `${productName} agregado al carrito` : status === "failed" ? (message ?? "No se pudo agregar") : ""}
      </span>
    </>
  );
};

export type { AddToCartButtonProps };
export { AddToCartButton };
