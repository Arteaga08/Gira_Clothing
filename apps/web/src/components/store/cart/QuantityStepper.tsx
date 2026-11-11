import { CART_LINE_MAX_QTY } from "@/lib/cart/guestCart";

interface QuantityStepperProps {
  qty: number;
  /** Product and variant, so a screen reader knows whose quantity it is. */
  label: string;
  /** An edit is in flight: the buttons stop acting but stay focusable. */
  disabled?: boolean;
  onChange: (qty: number) => void;
}

const BUTTON =
  "grid size-9 place-items-center bg-brand-subtle text-lg font-bold leading-none text-text-primary hover:bg-surface-sunken aria-disabled:cursor-not-allowed aria-disabled:opacity-45 aria-disabled:hover:bg-brand-subtle";

/**
 * 1 to 20 units of one line. A button that cannot act (at a limit, or while saving) is `aria-disabled`, never
 * `disabled`: a disabled button drops keyboard focus to the page, and the person would lose their place on
 * every press.
 */
const QuantityStepper = ({ qty, label, disabled = false, onChange }: QuantityStepperProps) => {
  const minusOff = disabled || qty <= 1;
  const plusOff = disabled || qty >= CART_LINE_MAX_QTY;

  return (
    <div role="group" aria-label={`Cantidad de ${label}`} className="inline-flex items-center overflow-hidden rounded-nb-sm border-2 border-ink bg-surface">
      <button
        type="button"
        aria-label="Una unidad menos"
        {...(minusOff ? { "aria-disabled": true } : {})}
        onClick={() => {
          if (!minusOff) onChange(qty - 1);
        }}
        className={`${BUTTON} border-r-2 border-ink`}
      >
        −
      </button>
      <output aria-live="polite" className="min-w-10 px-1 text-center font-mono text-sm font-bold">
        {qty}
      </output>
      <button
        type="button"
        aria-label="Una unidad más"
        {...(plusOff ? { "aria-disabled": true } : {})}
        onClick={() => {
          if (!plusOff) onChange(qty + 1);
        }}
        className={`${BUTTON} border-l-2 border-ink`}
      >
        +
      </button>
    </div>
  );
};

export { QuantityStepper };
