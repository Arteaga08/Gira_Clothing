"use client";

import dynamic from "next/dynamic";
import { Notice } from "@/components/ui/Notice";
import { Skeleton } from "@/components/ui/Skeleton";
import { stripePublishableKey } from "@/lib/checkout/stripeConfig";
import type { PaymentFieldsProps } from "./PaymentFields";

// Stripe.js and its React bindings live in their own chunk, fetched only when the payment step renders,
// and never on the server (Stripe needs the browser).
const PaymentFields = dynamic(() => import("./PaymentFields").then((m) => m.PaymentFields), {
  ssr: false,
  loading: () => <Skeleton className="h-36! w-full rounded-nb-sm!" />,
});

/** The card form, or «Pagos no disponibles» when the project has no publishable key (nothing from Stripe is loaded then). */
const PaymentSection = (props: PaymentFieldsProps) =>
  stripePublishableKey ? (
    <PaymentFields {...props} />
  ) : (
    <Notice variant="warning" title="Pagos no disponibles">
      Por ahora no podemos recibir pagos en línea. Inténtalo más tarde.
    </Notice>
  );

export { PaymentSection };
