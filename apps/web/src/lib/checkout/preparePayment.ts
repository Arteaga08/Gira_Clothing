import type { CreatedOrder, PublicOrder, Wire } from "@gira/shared";
import { formatPesos } from "@/lib/catalog/money";
import { mapCheckoutFailure, type CheckoutFailure } from "./checkoutFailures";

interface PrepareInput {
  key: string;
  /** The total the person is looking at, MXN centavos. */
  shownTotal: number;
  create: (key: string) => Promise<Wire<CreatedOrder>>;
  forgetKey: () => void;
}

type PrepareResult =
  | { ok: true; order: Wire<PublicOrder>; clientSecret: string }
  | { ok: false; failure: CheckoutFailure };

/**
 * Creates the order and checks it before any card is charged. If the order's total is not the one on
 * screen, the secret is NOT handed back: the order exists (and is pending), so the person is sent to
 * review it instead of paying an amount they did not see.
 */
const preparePayment = async ({ key, shownTotal, create, forgetKey }: PrepareInput): Promise<PrepareResult> => {
  let created: Wire<CreatedOrder>;
  try {
    created = await create(key);
  } catch (error) {
    const failure = mapCheckoutFailure(error);
    if (failure.definitive) forgetKey();
    return { ok: false, failure };
  }

  const { order, clientSecret } = created;
  if (order.total !== shownTotal) {
    return {
      ok: false,
      failure: {
        action: "resume",
        message: `El total de tu pedido cambió a ${formatPesos(order.total)}. Revísalo y págalo desde tu pedido pendiente.`,
        definitive: false,
      },
    };
  }
  if (!clientSecret) {
    return {
      ok: false,
      failure: {
        action: "resume",
        message: "Tu pedido se creó, pero no pudimos iniciar el pago. Págalo desde tu pedido pendiente.",
        definitive: false,
      },
    };
  }
  return { ok: true, order, clientSecret };
};

/**
 * Resuming a pending order from «Mis pedidos»: the order already exists (and its total was agreed when it
 * was created), so there is nothing to compare, only the intent's secret to fetch.
 */
const resumePayment = async (pay: () => Promise<Wire<CreatedOrder>>): Promise<PrepareResult> => {
  let resumed: Wire<CreatedOrder>;
  try {
    resumed = await pay();
  } catch (error) {
    return { ok: false, failure: mapCheckoutFailure(error) };
  }
  if (!resumed.clientSecret) {
    return {
      ok: false,
      failure: { action: "none", message: "No pudimos iniciar el pago de este pedido. Inténtalo de nuevo en un momento.", definitive: false },
    };
  }
  return { ok: true, order: resumed.order, clientSecret: resumed.clientSecret };
};

export type { PrepareInput, PrepareResult };
export { preparePayment, resumePayment };
