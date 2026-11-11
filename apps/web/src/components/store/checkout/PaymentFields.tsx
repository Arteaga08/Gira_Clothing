"use client";

import { useMemo, useRef, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Skeleton } from "@/components/ui/Skeleton";
import { announceCartChange } from "@/lib/cart/guestCart";
import type { CheckoutFailure } from "@/lib/checkout/checkoutFailures";
import type { PrepareResult } from "@/lib/checkout/preparePayment";
import { buildStripeAppearance, readToken, readTokenColor } from "@/lib/checkout/stripeAppearance";
import { mapConfirmResult, mapSubmitError } from "@/lib/checkout/stripeOutcomes";
import { stripePublishableKey } from "@/lib/checkout/stripeConfig";
import { FailureNotice, type FailureHandlers } from "./FailureNotice";

// Loaded once for the whole session. This file is only ever imported through `next/dynamic`, so Stripe.js
// is requested when the payment step first renders, not with the page.
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

interface PaymentFieldsProps {
  /** MXN centavos the Element is told the intent will charge. */
  amount: number;
  /** «Pagar $1,301.30». */
  payLabel: string;
  /** Everything outside the card that must be true first (address, shipping, terms). */
  canPay: boolean;
  /** Creates (or fetches) the order whose secret confirms the payment. */
  prepare: () => Promise<PrepareResult>;
  /** Where Stripe sends the person back if the bank needs a full-page step. */
  returnUrl: (publicId: string) => string;
  onPaid: (publicId: string) => void;
  handlers?: FailureHandlers;
}

type Problem = { kind: "failure"; failure: CheckoutFailure } | { kind: "card"; title: string; message: string };

const PaymentForm = ({ payLabel, canPay, prepare, returnUrl, onPaid, handlers }: Omit<PaymentFieldsProps, "amount">) => {
  const stripe = useStripe();
  const elements = useElements();
  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  // A ref, not the state: two clicks in the same frame both see `processing === false`.
  const inFlight = useRef(false);

  const pay = async (): Promise<void> => {
    if (!stripe || !elements || !ready || !canPay || inFlight.current) return;
    inFlight.current = true;
    setProcessing(true);
    setProblem(null);
    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setProblem({ kind: "card", title: "Revisa tu tarjeta", message: mapSubmitError(submitError) });
        return;
      }
      const prepared = await prepare();
      if (!prepared.ok) {
        setProblem({ kind: "failure", failure: prepared.failure });
        return;
      }
      const result = await stripe.confirmPayment({
        elements,
        clientSecret: prepared.clientSecret,
        confirmParams: { return_url: returnUrl(prepared.order.publicId) },
        redirect: "if_required",
      });
      const outcome = mapConfirmResult(result);
      if (outcome.status === "submitted" || outcome.status === "already") {
        announceCartChange();
        onPaid(prepared.order.publicId);
        return;
      }
      const reserved = outcome.status === "declined" ? " Tu pedido sigue reservado por unos minutos." : "";
      setProblem({
        kind: "card",
        title: outcome.status === "declined" ? "Tu tarjeta fue rechazada" : "No pudimos cobrar",
        message: `${outcome.message}${reserved}`,
      });
    } catch {
      // Anything unexpected (a dropped connection while confirming, a failure building the order): never leave the person guessing.
      setProblem({
        kind: "card",
        title: "No pudimos completar el pago",
        message: "Revisa tu conexión e inténtalo de nuevo. Si ya se creó tu pedido no se duplica: lo verás en «Mis pedidos».",
      });
    } finally {
      inFlight.current = false;
      setProcessing(false);
    }
  };

  const blocked = !ready || !canPay;

  return (
    <div className="grid gap-4">
      {loadFailed ? (
        <Notice variant="danger" title="No pudimos cargar el formulario de pago">
          Recarga la página e inténtalo de nuevo.
        </Notice>
      ) : (
        <div className="relative">
          {ready ? null : <Skeleton className="h-36! w-full rounded-nb-sm!" />}
          <div className={ready ? undefined : "absolute inset-0 opacity-0"}>
            <PaymentElement
              options={{ wallets: { applePay: "never", googlePay: "never" } }}
              onReady={() => setReady(true)}
              onLoadError={() => setLoadFailed(true)}
            />
          </div>
        </div>
      )}
      {problem?.kind === "card" ? (
        <Notice variant="danger" title={problem.title}>
          {problem.message}
        </Notice>
      ) : null}
      {problem?.kind === "failure" ? <FailureNotice failure={problem.failure} handlers={handlers ?? {}} /> : null}
      {/* Never `disabled`/`loading`: a disabled button drops keyboard focus, and after a refused card the person would start over. */}
      <Button
        type="button"
        variant="primary"
        aria-disabled={blocked || processing || undefined}
        aria-busy={processing || undefined}
        className="w-full"
        onClick={() => void pay()}
      >
        {processing ? "Procesando tu pago…" : payLabel}
      </Button>
    </div>
  );
};

/** Payment Element in deferred mode: it knows the amount and the card-only rule before any order exists. */
const PaymentFields = ({ amount, ...rest }: PaymentFieldsProps) => {
  const appearance = useMemo(() => buildStripeAppearance({ color: readTokenColor, text: readToken }), []);
  const options = useMemo(
    () => ({ mode: "payment" as const, amount, currency: "mxn", paymentMethodTypes: ["card"], locale: "es" as const, appearance }),
    [amount, appearance],
  );

  return (
    <Elements stripe={stripePromise} options={options}>
      <PaymentForm {...rest} />
    </Elements>
  );
};

export type { PaymentFieldsProps };
export { PaymentFields };
