import { CartLineStatus } from "@gira/shared";
import { cardImageUrl } from "@/components/store/best-sellers/cardImage";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { formatPesos } from "@/lib/catalog/money";
import type { CartLine } from "@/lib/checkout/cartTotals";
import { QuantityStepper } from "./QuantityStepper";

const THUMB_WIDTH = 160;

const STATUS_NOTE: Record<Exclude<CartLineStatus, CartLineStatus.AVAILABLE>, { chip: string; tone: string }> = {
  [CartLineStatus.OUT_OF_STOCK]: { chip: "Agotado por ahora", tone: "bg-warning-soft" },
  [CartLineStatus.RETIRED]: { chip: "Ya no está disponible", tone: "bg-danger-soft" },
};

interface CartLineRowProps {
  line: CartLine;
  busy: boolean;
  onQty: (qty: number) => void;
  onRemove: () => void;
}

/**
 * One cart line. A sold-out or retired line stays visible and marked (it is left out of the total and blocks
 * the checkout until it is removed); a retired one carries no data but its id, so it can only be removed.
 */
const CartLineRow = ({ line, busy, onQty, onRemove }: CartLineRowProps) => {
  const available = line.status === CartLineStatus.AVAILABLE;
  const retired = line.status === CartLineStatus.RETIRED;
  const note = line.status === CartLineStatus.AVAILABLE ? null : STATUS_NOTE[line.status];
  const name = line.productName ?? "Este producto";
  const detail = [line.printName, line.sku].filter(Boolean).join(" · ");

  return (
    <li className="flex items-start gap-4 py-5" aria-busy={busy || undefined}>
      <span className={cn("block size-20 shrink-0 overflow-hidden rounded-nb-sm border-2 border-ink bg-tile-alt", !available && "opacity-50 grayscale")}>
        {line.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- Cloudinary URL from the API; no next/image loader is configured
          <img src={cardImageUrl(line.image.url, THUMB_WIDTH)} alt="" width={THUMB_WIDTH} height={200} loading="lazy" decoding="async" className="size-full object-cover" />
        ) : null}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("font-bold", !available && "line-through decoration-2")}>{retired ? "Este producto ya no está disponible" : name}</p>
        {detail ? <p className="break-words font-mono text-2xs text-text-muted sm:text-xs">{detail}</p> : null}
        {note ? (
          <span className={cn("mt-1 inline-block rounded-full border-2 border-ink px-2 font-mono text-2xs font-bold uppercase tracking-wide", note.tone)}>
            {note.chip}
          </span>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {retired ? null : <QuantityStepper qty={line.qty} label={name} disabled={busy} onChange={onQty} />}
          <Button type="button" variant="danger" size="sm" onClick={onRemove}>
            Quitar
            <span className="sr-only">{` ${name}`}</span>
          </Button>
        </div>
      </div>
      {line.unitPriceMxn === undefined ? null : (
        <span className={cn("font-mono text-lg font-bold", available ? "text-accent" : "text-text-muted line-through")}>
          {formatPesos(line.unitPriceMxn * line.qty)}
        </span>
      )}
    </li>
  );
};

export { CartLineRow };
