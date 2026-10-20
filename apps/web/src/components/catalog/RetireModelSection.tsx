"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Notice } from "@/components/ui/Notice";
import { EditorSection } from "./EditorSection";

interface RetireModelSectionProps {
  productId: string;
  productName: string;
  isActive: boolean;
  /** Active variants the SERVER holds (not the unsaved selection). */
  activeVariantCount: number;
  /** May throw: the dialog shows the API's own Spanish message (a 409 while variants are active). */
  onRetire: () => Promise<void>;
  /** Never throws: the caller toasts a failure. */
  onReactivate: () => Promise<void>;
}

const variantsLabel = (count: number): string => (count === 1 ? "1 variante activa" : `${count} variantes activas`);

/**
 * Retiring is a soft delete the API only allows once no variant is active.
 * The panel mirrors that rule up front: it blocks, says why, and points at
 * the stock screen, instead of letting the operator hit the 409.
 */
const RetireModelSection = ({
  productId,
  productName,
  isActive,
  activeVariantCount,
  onRetire,
  onReactivate,
}: RetireModelSectionProps) => {
  const [confirming, setConfirming] = useState(false);
  const [reactivating, setReactivating] = useState(false);

  if (!isActive) {
    return (
      <EditorSection title="Modelo retirado">
        <Notice variant="info" title="Este modelo no aparece en el catálogo">
          <p>Reactívalo para volver a venderlo. Sus estampas hay que volver a elegirlas.</p>
        </Notice>
        <div>
          <Button
            loading={reactivating}
            onClick={() => {
              setReactivating(true);
              void onReactivate().finally(() => setReactivating(false));
            }}
          >
            Reactivar modelo
          </Button>
        </div>
      </EditorSection>
    );
  }

  const blocked = activeVariantCount > 0;

  return (
    <EditorSection title="Retirar este modelo">
      {blocked ? (
        <Notice variant="warning" title="No se puede retirar todavía">
          <p>
            Tiene {variantsLabel(activeVariantCount)}. Quita todas sus estampas de la sección Estampas y guarda; después
            podrás retirarlo.{" "}
            <Link href={`/inventario?modelo=${productId}`} className="font-bold underline">
              Ver en Inventario
            </Link>
          </p>
        </Notice>
      ) : (
        <p className="text-sm text-text-secondary">Dejará de mostrarse en el catálogo. Podrás reactivarlo después.</p>
      )}
      <div>
        <Button variant="danger" disabled={blocked} onClick={() => setConfirming(true)}>
          Retirar modelo
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        tone="danger"
        title={`Retirar «${productName}»`}
        description="Dejará de mostrarse en el catálogo. Podrás reactivarlo después."
        confirmLabel="Retirar modelo"
        onCancel={() => setConfirming(false)}
        onConfirm={async () => {
          await onRetire();
          setConfirming(false);
        }}
      />
    </EditorSection>
  );
};

export type { RetireModelSectionProps };
export { RetireModelSection };
