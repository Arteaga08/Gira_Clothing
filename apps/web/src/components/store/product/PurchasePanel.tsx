"use client";

import { Minus, Plus } from "@phosphor-icons/react";
import type { PublicProductVariant } from "@gira/shared";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { T_LABEL } from "@/components/ui/typography";
import { useCartAdd, type CartAddStatus } from "@/components/store/best-sellers/useCartAdd";
import { CART_LINE_MAX_QTY } from "@/lib/cart/guestCart";
import { formatPesos } from "@/lib/catalog/money";
import { WishlistHeart } from "@/components/store/wishlist/WishlistHeart";
import { PrintPicker } from "./PrintPicker";
import { PurchaseAssurances } from "./PurchaseAssurances";

interface PurchasePanelProps {
  productName: string;
  variants: PublicProductVariant[];
  selected: number;
  onSelect: (index: number) => void;
  /** MXN centavos of one unit of the selected variant. */
  unitPrice: number;
  qty: number;
  onQtyChange: (qty: number) => void;
  authenticated: boolean;
}

const LABEL: Record<CartAddStatus, string> = {
  idle: "Agregar al carrito",
  adding: "Agregando",
  added: "Agregado",
  full: "Ya tienes el máximo",
  failed: "No se pudo agregar",
};

/**
 * Right column: print picker, quantity, the screen's one primary button and the
 * guarantees. Sold out says so on the button and disables it; a failed add
 * carries the API's own reason in the title.
 */
const PurchasePanel = ({ productName, variants, selected, onSelect, unitPrice, qty, onQtyChange, authenticated }: PurchasePanelProps) => {
  const variant = variants[selected];
  const { status, message, add } = useCartAdd(variant?.id ?? "", authenticated, qty);
  const available = variant?.isAvailable ?? false;

  return (
    <div className="grid content-start gap-4 p-5 md:p-6">
      {variants.length > 0 ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className={T_LABEL}>Elige tu estampa</p>
            <WishlistHeart variantId={variant?.id ?? ""} productName={productName} authenticated={authenticated} />
          </div>
          <PrintPicker variants={variants} selected={selected} onSelect={onSelect} />
          <div className="flex items-center justify-between gap-4 border-y-2 border-ink py-3.5">
            <IconButton variant="edit" icon={Minus} label="Quitar una" disabled={qty <= 1} onClick={() => onQtyChange(qty - 1)} />
            <output aria-live="polite" className="font-mono text-sm font-bold uppercase">
              {qty} {qty === 1 ? "pieza" : "piezas"}
            </output>
            <IconButton variant="edit" icon={Plus} label="Agregar una" disabled={qty >= CART_LINE_MAX_QTY} onClick={() => onQtyChange(qty + 1)} />
          </div>
          <Button
            variant="primary"
            loading={status === "adding"}
            disabled={!available}
            onClick={() => void add()}
            title={status === "failed" && message ? message : undefined}
            className="min-h-14! w-full justify-between px-6! py-3.5! text-base!"
          >
            <span>{available ? LABEL[status] : "Agotada"}</span>
            <span className="font-mono text-lg">{formatPesos(unitPrice * qty)}</span>
          </Button>
          <span role="status" className="sr-only">
            {status === "added" ? `${productName} agregado al carrito` : status === "failed" ? (message ?? "No se pudo agregar") : ""}
          </span>
        </>
      ) : (
        <p className="rounded-nb-sm border-2 border-ink bg-surface p-4 text-sm font-bold">Por ahora no hay estampas disponibles para esta prenda.</p>
      )}
      <PurchaseAssurances />
    </div>
  );
};

export type { PurchasePanelProps };
export { PurchasePanel };
