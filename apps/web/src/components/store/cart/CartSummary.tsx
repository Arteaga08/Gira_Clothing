"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, buttonClassName } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { formatPesos } from "@/lib/catalog/money";
import type { CartTotals } from "@/lib/checkout/cartTotals";
import { STORE_ROUTES } from "@/lib/store/routes";
import { CartGate } from "./CartGate";

interface CartSummaryProps {
  totals: CartTotals;
  authenticated: boolean;
}

/** Stub of the cart pass: what the available lines add up to, and the one way forward. */
const CartSummary = ({ totals, authenticated }: CartSummaryProps) => {
  const [askingToSignIn, setAskingToSignIn] = useState(false);
  const blockedCount = totals.blocked.length;

  return (
    <>
      {blockedCount > 0 ? (
        <Notice variant="warning" title={blockedCount === 1 ? "Quita 1 artículo para continuar" : `Quita ${String(blockedCount)} artículos para continuar`}>
          Los marcados no cuentan en el total. Quítalos y sigue al pago.
        </Notice>
      ) : null}
      <dl className="grid gap-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt>{totals.units === 1 ? "Subtotal (1 artículo)" : `Subtotal (${String(totals.units)} artículos)`}</dt>
          <dd className="m-0 font-mono font-bold">{formatPesos(totals.subtotal)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Envío</dt>
          <dd className="m-0 text-text-muted">Se calcula al pagar</dd>
        </div>
        <div className="flex items-end justify-between gap-3 border-t-2 border-dashed border-ink pt-3">
          <dt className="font-mono text-2xs font-bold uppercase tracking-wide text-text-muted">Total</dt>
          <dd className="m-0 font-display text-4xl leading-none">{formatPesos(totals.subtotal)}</dd>
        </div>
        <p className="font-mono text-2xs text-text-muted">IVA incluido</p>
      </dl>
      {!totals.canCheckout ? (
        <>
          <Button type="button" variant="primary" disabled className="w-full">
            Continuar al pago
          </Button>
          {blockedCount > 0 ? <p className="font-mono text-2xs text-text-muted">Quita los artículos marcados para continuar.</p> : null}
        </>
      ) : authenticated ? (
        <Link href={STORE_ROUTES.checkout} className={buttonClassName("primary", "md", "w-full")}>
          Continuar al pago
        </Link>
      ) : askingToSignIn ? (
        <CartGate />
      ) : (
        <Button type="button" variant="primary" className="w-full" onClick={() => setAskingToSignIn(true)}>
          Continuar al pago
        </Button>
      )}
    </>
  );
};

export { CartSummary };
