import { useEffect, useRef } from "react";
import type { ShippingRate, Wire } from "@gira/shared";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Skeleton } from "@/components/ui/Skeleton";
import type { QuoteState } from "@/hooks/useShippingQuote";
import { cn } from "@/lib/cn";
import { formatPesos } from "@/lib/catalog/money";
import { carrierServiceLabel } from "@/lib/orders/shipping";

interface ShippingRatesProps {
  state: QuoteState;
  onRequest: () => void;
  onSelect: (rateId: string) => void;
}

const days = (n: number): string => (n === 1 ? "1 día" : `${String(n)} días`);
const clock = (iso: string): string => new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });

const RateOption = ({ rate, selected, cheapest, onSelect }: { rate: Wire<ShippingRate>; selected: boolean; cheapest: boolean; onSelect: () => void }) => (
  <label
    className={cn(
      "flex cursor-pointer items-center gap-3 rounded-nb-sm border-2 border-ink px-3.5 py-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
      selected ? "bg-brand-subtle shadow-nb-sm" : "bg-surface",
    )}
  >
    <input type="radio" name="shipping-rate" value={rate.rateId} checked={selected} onChange={onSelect} className="sr-only" />
    <span aria-hidden="true" className={cn("size-[18px] shrink-0 rounded-full border-2 border-ink", selected ? "bg-ink shadow-[inset_0_0_0_3px_var(--color-brand-subtle)]" : "bg-surface")} />
    <span className="min-w-0 flex-1">
      <b className="block text-sm">{carrierServiceLabel(rate.carrier, rate.serviceName)}</b>
      <span className="block font-mono text-2xs text-text-secondary">{`Llega en ${days(rate.estimatedDays)}`}</span>
    </span>
    {cheapest ? <span className="rounded-full border-2 border-ink bg-success-soft px-2 font-mono text-2xs font-bold uppercase tracking-wide">Más económico</span> : null}
    <span className="font-mono text-sm font-bold">{formatPesos(rate.amount)}</span>
  </label>
);

const RatesBody = ({ state, onRequest, onSelect }: ShippingRatesProps) => {
  switch (state.status) {
    case "idle":
      return (
        <Button type="button" variant="edit" onClick={onRequest}>
          Ver opciones de envío
        </Button>
      );
    case "loading":
      return (
        <div role="status" aria-busy="true" aria-label="Buscando opciones de envío" className="grid gap-3">
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} className="h-14! w-full rounded-nb-sm!" />
          ))}
        </div>
      );
    case "no-coverage":
      return (
        <Notice variant="warning" title="Sin paquetería para esa dirección">
          {`${state.message} Cambia la dirección o el código postal.`}
        </Notice>
      );
    case "error":
      return (
        <div className="grid justify-items-start gap-3">
          <Notice variant="danger" title="No pudimos cotizar el envío" className="w-full">
            {state.message}
          </Notice>
          <Button type="button" variant="positive" onClick={onRequest}>
            Reintentar
          </Button>
        </div>
      );
    case "expired":
      return (
        <div className="grid justify-items-start gap-3">
          <Notice variant="warning" title="Tu cotización venció" className="w-full">
            Las tarifas cambian con el tiempo. Vuelve a cotizar para elegir tu envío.
          </Notice>
          <Button type="button" variant="edit" onClick={onRequest}>
            Volver a cotizar
          </Button>
        </div>
      );
    case "ready": {
      const cheapest = Math.min(...state.quote.rates.map((r) => r.amount));
      const many = state.quote.rates.length > 1;
      return (
        <fieldset className="grid gap-3 border-0 p-0">
          <legend className="sr-only">Paquetería</legend>
          {state.quote.rates.map((rate) => (
            <RateOption key={rate.rateId} rate={rate} selected={rate.rateId === state.rateId} cheapest={many && rate.amount === cheapest} onSelect={() => onSelect(rate.rateId)} />
          ))}
          <p className="font-mono text-2xs text-text-muted">{`Tarifas vigentes hasta las ${clock(state.quote.expiresAt)}.`}</p>
        </fieldset>
      );
    }
  }
};

/**
 * The carrier options: ask for them, choose one, and every way it can fail (loading, error, no coverage, expired).
 * Asking replaces the button that had focus with a loading state, so when the answer lands focus goes to the chosen
 * rate (or to the retry button), never back to the top of the page. The expiry timer does not move focus.
 */
const ShippingRates = (props: ShippingRatesProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const previous = useRef(props.state.status);
  const { status } = props.state;

  useEffect(() => {
    const was = previous.current;
    previous.current = status;
    if (was !== "loading") return;
    const root = rootRef.current;
    if (status === "ready") root?.querySelector<HTMLElement>('input[type="radio"]:checked')?.focus();
    else if (status === "error") root?.querySelector<HTMLElement>("button")?.focus();
  }, [status]);

  return (
    <div ref={rootRef}>
      <RatesBody {...props} />
    </div>
  );
};

export { ShippingRates };
