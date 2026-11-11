"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { SavedAddress, Wire } from "@gira/shared";
import { StorePass } from "@/components/store/pass/StorePass";
import { Notice } from "@/components/ui/Notice";
import { T_PANEL_TITLE } from "@/components/ui/typography";
import { useAddressChoice } from "@/hooks/useAddressChoice";
import { useCheckoutSummary } from "@/hooks/useCheckoutSummary";
import { useShippingQuote } from "@/hooks/useShippingQuote";
import { createOrder } from "@/lib/api/orders";
import { formatPesos } from "@/lib/catalog/money";
import { destinationOf } from "@/lib/checkout/checkoutAddress";
import type { CartLine } from "@/lib/checkout/cartTotals";
import { checkoutFingerprint, forgetCheckoutKey, resolveCheckoutKey } from "@/lib/checkout/idempotencyKey";
import { preparePayment } from "@/lib/checkout/preparePayment";
import { publicOrderRoute } from "@/lib/store/routes";
import { AddressPicker } from "./AddressPicker";
import { CheckoutSummaryCard } from "./CheckoutSummaryCard";
import { CouponField } from "./CouponField";
import { PaymentSection } from "./PaymentSection";
import { ShippingRates } from "./ShippingRates";
import { TermsCheck } from "./TermsCheck";

interface CheckoutFlowProps {
  lines: CartLine[];
  addresses: Wire<SavedAddress>[];
}

const SECTION_TITLE = `${T_PANEL_TITLE} mb-3 text-2xl`;

/** `/checkout`: shipping and payment on one page, with the summary on the stub. Every amount comes from the server. */
const CheckoutFlow = ({ lines, addresses }: CheckoutFlowProps) => {
  const router = useRouter();
  const address = useAddressChoice(addresses);
  const shipping = useShippingQuote();
  const [terms, setTerms] = useState(false);

  const chosen = shipping.state.status === "ready" ? { quoteId: shipping.state.quote.quoteId, rateId: shipping.state.rateId } : null;
  const postalCode = chosen && address.current ? address.current.address.postalCode : null;
  const summary = useCheckoutSummary({ quote: chosen, postalCode });

  // A quote only fits the address it was made for: any change of address discards it.
  const { reset } = shipping;
  useEffect(() => reset(), [address.identity, reset]);

  const requestQuote = (): void => {
    const resolved = address.resolve();
    if (resolved) void shipping.request(destinationOf(resolved.address));
  };

  const total = summary.state.status === "ready" ? summary.state.summary.total : null;
  const canPay = Boolean(chosen && address.current && terms && total !== null && summary.state.status === "ready");

  const prepare = () => {
    // `canPay` guarantees these; the checks keep the types honest without non-null assertions.
    if (!chosen || !address.current || total === null) throw new Error("Checkout incompleto.");
    const { address: shippingAddress, phone } = address.current;
    const key = resolveCheckoutKey(
      checkoutFingerprint({
        lines,
        address: shippingAddress,
        phone,
        quote: chosen,
        couponCode: summary.coupon ?? undefined,
      }),
    );
    return preparePayment({
      key,
      shownTotal: total,
      forgetKey: () => forgetCheckoutKey(),
      create: (idempotencyKey) =>
        createOrder(
          {
            useCart: true,
            ...(summary.coupon ? { couponCode: summary.coupon } : {}),
            customer: { phone },
            shipping: shippingAddress,
            shippingQuote: chosen,
            termsAccepted: true,
          },
          idempotencyKey,
        ),
    });
  };

  const hint = !address.current
    ? "Completa tu dirección para poder pagar."
    : !chosen
      ? "Elige tu envío para poder pagar."
      : summary.state.status === "loading"
        ? "Calculando tu total…"
        : summary.state.status === "error"
          ? summary.state.message
          : !terms
            ? "Acepta los términos para poder pagar."
            : null;

  return (
    <StorePass tone="mint" stub={<CheckoutSummaryCard lines={lines} state={summary.state} shippingChosen={chosen !== null} />}>
      <div className="grid gap-8">
        <section aria-labelledby="checkout-shipping">
          <h2 id="checkout-shipping" className={SECTION_TITLE}>
            Envío
          </h2>
          <div className="grid gap-4">
            <AddressPicker
              addresses={addresses}
              choice={address.choice}
              values={address.values}
              errors={address.errors}
              onChoice={address.setChoice}
              onValue={address.setValue}
            />
            <ShippingRates state={shipping.state} onRequest={requestQuote} onSelect={shipping.selectRate} />
          </div>
        </section>
        <section aria-labelledby="checkout-payment" className="border-t-2 border-dashed border-ink pt-8">
          <h2 id="checkout-payment" className={SECTION_TITLE}>
            Pago
          </h2>
          <div className="grid gap-4">
            <CouponField applied={summary.coupon} error={summary.couponError} onApply={summary.applyCoupon} onRemove={summary.removeCoupon} />
            {summary.state.status === "error" && summary.state.belowMinimum ? (
              <Notice variant="warning" title="Tu total es menor a $10">
                {summary.state.message}
              </Notice>
            ) : null}
            <TermsCheck checked={terms} onChange={setTerms} />
            <PaymentSection
              amount={total ?? 1000}
              payLabel={total === null ? "Pagar" : `Pagar ${formatPesos(total)}`}
              canPay={canPay}
              prepare={prepare}
              returnUrl={(publicId) => `${window.location.origin}${publicOrderRoute(publicId)}`}
              onPaid={(publicId) => router.push(publicOrderRoute(publicId))}
              handlers={{
                onRequote: requestQuote,
                onRemoveCoupon: summary.removeCoupon,
              }}
            />
            {hint ? <p className="font-mono text-2xs text-text-muted">{hint}</p> : null}
          </div>
        </section>
      </div>
    </StorePass>
  );
};

export { CheckoutFlow };
