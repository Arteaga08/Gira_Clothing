const CHIP = "inline-flex h-7 items-center rounded-md border-2 border-ink bg-surface px-2.5 font-mono text-[0.6875rem] font-bold text-ink";

/** Card brands the checkout accepts (Stripe), as small chips; plain text, so no brand colour literals. */
const CardBrands = () => (
  <ul aria-label="Tarjetas aceptadas" className="mt-1 flex flex-wrap gap-2">
    <li className={CHIP}>VISA</li>
    <li className={CHIP} aria-label="Mastercard">
      <span aria-hidden="true" className="size-3 rounded-full bg-cat-cherry" />
      <span aria-hidden="true" className="-ml-1.5 size-3 rounded-full bg-cat-tangerine" />
    </li>
    <li className={CHIP}>AMEX</li>
  </ul>
);

export { CardBrands };
