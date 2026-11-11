"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ShoppingBagOpen, Warning } from "@phosphor-icons/react";
import { Button, buttonClassName } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Notice } from "@/components/ui/Notice";
import { StorePass } from "@/components/store/pass/StorePass";
import { useCartPage } from "@/hooks/useCartPage";
import { cartTotals } from "@/lib/checkout/cartTotals";
import { STORE_ROUTES } from "@/lib/store/routes";
import { CartLineRow } from "./CartLineRow";
import { CartSkeleton } from "./CartSkeleton";
import { CartSummary } from "./CartSummary";

const PLAIN_CARD = "rounded-nb border-2 border-ink bg-surface text-text-primary shadow-nb-lg";

/** `/carrito`: the lines on the left, the summary and the way to the checkout on the stub. */
const CartFlow = ({ authenticated }: { authenticated: boolean }) => {
  const { state, busyId, failure, reload, changeQty, remove } = useCartPage(authenticated);
  // Removing a line deletes the button that had focus: it moves to the list, or to the empty state if that was the last one.
  const listRef = useRef<HTMLUListElement>(null);
  const emptyRef = useRef<HTMLDivElement>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  useEffect(() => {
    if (focusRequest > 0) (listRef.current ?? emptyRef.current)?.focus();
  }, [focusRequest]);

  if (state.status === "error") {
    return (
      <div className={PLAIN_CARD}>
        <EmptyState
          icon={Warning}
          title="No pudimos cargar tu carrito"
          description="Revisa tu conexión e inténtalo de nuevo."
          action={
            <Button type="button" variant="positive" onClick={() => void reload()}>
              Reintentar
            </Button>
          }
        />
      </div>
    );
  }

  if (state.status === "ready" && state.lines.length === 0) {
    return (
      <div ref={emptyRef} tabIndex={-1} className={`${PLAIN_CARD} outline-none`}>
        <EmptyState
          icon={ShoppingBagOpen}
          title="Tu carrito está vacío"
          description="Elige una playera, un hoodie o una gorra y vuelve aquí para pagar."
          action={
            <Link href={STORE_ROUTES.shop} className={buttonClassName("primary")}>
              Ir a la tienda
            </Link>
          }
        />
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <StorePass stub={<CartSkeleton announce={false} />}>
        <CartSkeleton />
      </StorePass>
    );
  }

  const totals = cartTotals(state.lines);

  return (
    <StorePass stub={<CartSummary totals={totals} authenticated={authenticated} />}>
      {failure ? (
        <Notice variant="danger" title="No pudimos actualizar tu carrito" className="mb-3">
          Inténtalo de nuevo.
        </Notice>
      ) : null}
      <ul ref={listRef} tabIndex={-1} aria-label="Artículos de tu carrito" className="divide-y-2 divide-dashed divide-ink outline-none">
        {state.lines.map((line) => (
          <CartLineRow
            key={line.variantId}
            line={line}
            busy={busyId === line.variantId}
            onQty={(qty) => void changeQty(line.variantId, qty)}
            onRemove={() => void remove(line.variantId).then((done) => done && setFocusRequest((n) => n + 1))}
          />
        ))}
      </ul>
    </StorePass>
  );
};

export { CartFlow };
