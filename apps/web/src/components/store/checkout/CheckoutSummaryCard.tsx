import { cardImageUrl } from "@/components/store/best-sellers/cardImage";
import { Skeleton } from "@/components/ui/Skeleton";
import type { SummaryState } from "@/hooks/useCheckoutSummary";
import { formatPesos } from "@/lib/catalog/money";
import type { CartLine } from "@/lib/checkout/cartTotals";

interface CheckoutSummaryCardProps {
  lines: CartLine[];
  state: SummaryState;
  /** Whether a carrier was chosen: until then the shipping row asks for it instead of showing $0. */
  shippingChosen: boolean;
}

const THUMB_WIDTH = 120;

const Row = ({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) => (
  <div className="flex justify-between gap-3">
    <dt>{label}</dt>
    <dd className={muted ? "m-0 text-text-muted" : "m-0 font-mono font-bold"}>{value}</dd>
  </div>
);

/** Stub of the checkout pass: what is being bought and the amounts the server will charge. */
const CheckoutSummaryCard = ({ lines, state, shippingChosen }: CheckoutSummaryCardProps) => (
  <section aria-label="Resumen de tu pedido" className="grid gap-4">
    <ul className="grid gap-3">
      {lines.map((line) => (
        <li key={line.variantId} className="flex items-center gap-3 text-sm">
          <span className="block size-12 shrink-0 overflow-hidden rounded-nb-sm border-2 border-ink bg-surface">
            {line.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- Cloudinary URL from the API; no next/image loader is configured
              <img src={cardImageUrl(line.image.url, THUMB_WIDTH)} alt="" width={THUMB_WIDTH} height={150} loading="lazy" decoding="async" className="size-full object-cover" />
            ) : null}
          </span>
          <span className="min-w-0 flex-1">
            <b className="block truncate">{line.productName}</b>
            <span className="block truncate font-mono text-2xs text-text-secondary">{`${line.printName ?? ""} · Cantidad ${String(line.qty)}`}</span>
          </span>
          <span className="font-mono font-bold">{formatPesos((line.unitPriceMxn ?? 0) * line.qty)}</span>
        </li>
      ))}
    </ul>
    <div className="border-t-2 border-dashed border-ink pt-3">
      {state.status === "ready" ? (
        <dl className="grid gap-2 text-sm">
          <Row label="Subtotal" value={formatPesos(state.summary.subtotal)} />
          {state.summary.coupon ? <Row label={`Cupón ${state.summary.coupon.code}`} value={`-${formatPesos(state.summary.discount)}`} /> : null}
          {shippingChosen ? <Row label="Envío" value={state.summary.shippingCost === 0 ? "Gratis" : formatPesos(state.summary.shippingCost)} /> : <Row label="Envío" value="Elige tu envío" muted />}
          <div className="flex items-end justify-between gap-3 border-t-2 border-dashed border-ink pt-3">
            <dt className="font-mono text-2xs font-bold uppercase tracking-wide text-text-muted">Total</dt>
            <dd className="m-0 font-display text-4xl leading-none">{formatPesos(state.summary.total)}</dd>
          </div>
          <p className="font-mono text-2xs text-text-muted">IVA incluido · totales calculados por Gira</p>
        </dl>
      ) : state.status === "loading" ? (
        <div role="status" aria-label="Calculando tu total" className="grid gap-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="mt-2 h-8! w-1/2" />
        </div>
      ) : (
        <p role="alert" className="text-sm">
          {state.message}
        </p>
      )}
    </div>
  </section>
);

export { CheckoutSummaryCard };
