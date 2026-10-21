"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Notice } from "@/components/ui/Notice";
import type { PanelPrint } from "@/lib/prints/panelPrint";
import { productPath } from "@/lib/catalog/productId";
import { assertPrintId } from "@/lib/prints/printId";

interface RetirePrintSectionProps {
  print: PanelPrint;
  /** The API's message from the last retire/reactivate that failed (a 409 while variants are active or the family is retired). */
  error: string | null;
  /** Never throws: resolves `false` on failure and the caller keeps the message in `error`. */
  onRetire: () => Promise<boolean>;
  onReactivate: () => Promise<boolean>;
}

const activeLabel = (count: number): string => (count === 1 ? "1 variante activa" : `${count} variantes activas`);

/**
 * Retiring is a soft delete the API only allows once no variant is active.
 * The panel mirrors that rule up front: it blocks, says why, names the models
 * that still use the print and points at the stock screen, instead of letting
 * the operator hit the 409.
 */
const RetirePrintSection = ({ print, error, onRetire, onReactivate }: RetirePrintSectionProps) => {
  const [confirming, setConfirming] = useState(false);
  const [reactivating, setReactivating] = useState(false);

  const errorNotice = error ? (
    <p role="alert" className="text-sm text-danger">
      {error}
    </p>
  ) : null;

  if (!print.isActive) {
    return (
      <section className="flex flex-col gap-3 border-t-2 border-ink pt-4" aria-label="Estampa retirada">
        <Notice variant="info" title="Esta estampa está retirada">
          <p>No aparece al elegir estampas. Reactívala para volver a usarla en los modelos.</p>
        </Notice>
        <div>
          <Button
            loading={reactivating}
            onClick={() => {
              setReactivating(true);
              void onReactivate().finally(() => setReactivating(false));
            }}
          >
            Reactivar estampa
          </Button>
        </div>
        {errorNotice}
      </section>
    );
  }

  const blocked = print.activeVariantCount > 0;
  const hidden = print.activeVariantCount - print.activeProducts.length;

  return (
    <section className="flex flex-col gap-3 border-t-2 border-ink pt-4" aria-label="Retirar estampa">
      {blocked ? (
        <Notice variant="warning" title="No se puede retirar todavía">
          <p>
            Está en {activeLabel(print.activeVariantCount)}. Retira primero esas variantes, desde Inventario o desde cada
            modelo, y después podrás retirar la estampa.
          </p>
          <ul className="mt-3 flex flex-col gap-1.5">
            {print.activeProducts.map((product) => (
              <li key={product.id}>
                <Link
                  href={productPath(product.id)}
                  className="flex items-center justify-between gap-2 rounded-nb-sm border-2 border-ink bg-surface px-3 py-1.5 font-bold underline-offset-2 hover:underline"
                >
                  {product.name}
                  <span aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
            {hidden > 0 ? <li className="px-1 text-xs">y {hidden} más</li> : null}
          </ul>
          <p className="mt-3">
            <Link href={`/inventario?print=${assertPrintId(print.id)}`} className="font-bold underline">
              {print.activeVariantCount === 1
                ? "Ver la variante en Inventario"
                : `Ver las ${print.activeVariantCount} variantes en Inventario`}
            </Link>
          </p>
        </Notice>
      ) : (
        <p className="text-sm text-text-secondary">
          Dejará de aparecer al elegir estampas. Podrás reactivarla después.
        </p>
      )}
      <div>
        <Button variant="danger" disabled={blocked} onClick={() => setConfirming(true)}>
          Retirar estampa
        </Button>
      </div>
      {errorNotice}
      <ConfirmDialog
        open={confirming}
        tone="danger"
        title={`Retirar «${print.name}»`}
        description="Dejará de aparecer al elegir estampas. Podrás reactivarla después."
        confirmLabel="Retirar estampa"
        onCancel={() => setConfirming(false)}
        onConfirm={async () => {
          setConfirming(false);
          await onRetire();
        }}
      />
    </section>
  );
};

export type { RetirePrintSectionProps };
export { RetirePrintSection };
