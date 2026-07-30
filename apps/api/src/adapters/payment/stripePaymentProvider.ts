import Stripe from "stripe";
import { Currency, PaymentStatus } from "@gira/shared";
import type { StripeConfig } from "../../config/env.js";
import { AppError } from "../../utils/AppError.js";
import { logger } from "../../config/logger.js";
import {
  ProviderEventType,
  type CreatePaymentInput,
  type PaymentView,
  type PaymentProvider,
  type ProviderEvent,
} from "./types.js";

/**
 * Stripe adapter behind the PaymentProvider interface. No Stripe type crosses
 * into services/business code — only this file and the factory know the SDK
 * exists.
 */

const STATUS_MAP: Record<Stripe.PaymentIntent.Status, PaymentStatus> = {
  requires_payment_method: PaymentStatus.REQUIRES_PAYMENT,
  requires_confirmation: PaymentStatus.REQUIRES_PAYMENT,
  requires_action: PaymentStatus.REQUIRES_PAYMENT,
  requires_capture: PaymentStatus.REQUIRES_PAYMENT,
  processing: PaymentStatus.PROCESSING,
  succeeded: PaymentStatus.SUCCEEDED,
  canceled: PaymentStatus.CANCELLED,
};

const EVENT_MAP: Partial<Record<string, ProviderEventType>> = {
  "payment_intent.succeeded": ProviderEventType.PAYMENT_SUCCEEDED,
  "payment_intent.payment_failed": ProviderEventType.PAYMENT_FAILED,
  "payment_intent.canceled": ProviderEventType.PAYMENT_CANCELLED,
  "charge.refunded": ProviderEventType.PAYMENT_REFUNDED,
  "charge.dispute.created": ProviderEventType.DISPUTE_OPENED,
};

const toPaymentView = (intent: Stripe.PaymentIntent): PaymentView => ({
  providerId: intent.id,
  status: STATUS_MAP[intent.status],
  amount: intent.amount,
  currency: intent.currency.toUpperCase() as Currency,
  ...(intent.client_secret ? { clientSecret: intent.client_secret } : {}),
  ...(intent.last_payment_error?.message
    ? { lastError: intent.last_payment_error.message }
    : {}),
});

interface EventObjectRef {
  id: string;
  payment_intent?: string | { id: string } | null;
  /**
   * Metadata is set on the PaymentIntent at creation. Charge/Dispute events
   * carry the Charge's own metadata, which Stripe does NOT reliably mirror
   * from the intent — so `orderId` may be absent here even though it exists
   * on the intent. webhookService (Tarea 14) must be able to resolve the
   * order by `paymentId` alone; treat `orderId` here as a convenience, never
   * the only path.
   */
  metadata?: Record<string, string>;
  amount?: number;
  status?: string;
  /** Decline reason on a PaymentIntent event. */
  last_payment_error?: { message?: string } | null;
  /** Same thing on a Charge event — Stripe does NOT mirror it into the field above. */
  failure_message?: string | null;
}

/** Pulls the payment intent id and our own orderId (from metadata, if present) out of any event shape. */
const extractRefs = (
  event: Stripe.Event,
): { paymentId?: string; orderId?: string; amount?: number; reason?: string } => {
  const obj = event.data.object as unknown as EventObjectRef;
  const paymentIntentRef = obj.payment_intent;
  const paymentId =
    (typeof paymentIntentRef === "string" ? paymentIntentRef : paymentIntentRef?.id) ?? obj.id;
  const orderId = obj.metadata?.orderId;
  // Both shapes are read because the two event families carry the decline text in
  // different fields. Dropping this is what left `order.payment.lastError` empty
  // and the team's "pago rechazado" alert with nothing actionable in it.
  const reason = obj.last_payment_error?.message ?? obj.failure_message ?? undefined;
  return {
    ...(paymentId ? { paymentId } : {}),
    ...(orderId ? { orderId } : {}),
    ...(obj.amount !== undefined ? { amount: obj.amount } : {}),
    ...(reason ? { reason } : {}),
  };
};

const createStripePaymentProvider = (config: StripeConfig): PaymentProvider => {
  const client = new Stripe(config.secretKey);

  const createPayment = async (input: CreatePaymentInput): Promise<PaymentView> => {
    try {
      const intent = await client.paymentIntents.create(
        {
          amount: input.amount,
          currency: input.currency.toLowerCase(),
          metadata: input.metadata,
          ...(input.receiptEmail ? { receipt_email: input.receiptEmail } : {}),
          automatic_payment_methods: { enabled: true },
        },
        { idempotencyKey: input.idempotencyKey },
      );
      return toPaymentView(intent);
    } catch (err) {
      logger.error({ err }, "Stripe createPayment failed");
      throw new AppError("No se pudo iniciar el cobro. Intenta de nuevo.", 502);
    }
  };

  const getPayment = async (providerId: string): Promise<PaymentView> => {
    try {
      const intent = await client.paymentIntents.retrieve(providerId);
      return toPaymentView(intent);
    } catch (err) {
      logger.error({ err }, "Stripe getPayment failed");
      throw new AppError("No se pudo consultar el estado del pago.", 502);
    }
  };

  const cancelPayment = async (providerId: string): Promise<void> => {
    try {
      await client.paymentIntents.cancel(providerId);
    } catch (err) {
      // Stripe also rejects a cancel on an intent that already succeeded or was
      // cancelled. The caller decides what that means — here we only report it.
      logger.error({ err }, "Stripe cancelPayment failed");
      throw new AppError("No se pudo cancelar el cobro pendiente.", 502);
    }
  };

  const refundPayment = async (providerId: string, amount?: number): Promise<void> => {
    try {
      await client.refunds.create({
        payment_intent: providerId,
        ...(amount !== undefined ? { amount } : {}),
      });
    } catch (err) {
      logger.error({ err }, "Stripe refundPayment failed");
      throw new AppError("No se pudo procesar el reembolso.", 502);
    }
  };

  const parseWebhookEvent = (rawBody: Buffer, signature: string): ProviderEvent => {
    let event: Stripe.Event;
    try {
      // Signature + timestamp tolerance in one call; a replayed capture past
      // the window throws here and never reaches business code.
      event = client.webhooks.constructEvent(
        rawBody,
        signature,
        config.webhookSecret,
        config.webhookToleranceSeconds,
      );
    } catch (err) {
      logger.warn({ err }, "Stripe webhook signature rejected");
      throw new AppError("Firma del webhook inválida.", 400);
    }

    // charge.dispute.closed carries the outcome in the payload, not the type.
    if (event.type === "charge.dispute.closed") {
      const dispute = event.data.object as unknown as EventObjectRef;
      const type =
        dispute.status === "won"
          ? ProviderEventType.DISPUTE_CLOSED_WON
          : ProviderEventType.DISPUTE_CLOSED_LOST;
      return { id: event.id, type, ...extractRefs(event), raw: event };
    }

    const type = EVENT_MAP[event.type] ?? ProviderEventType.IGNORED;
    return { id: event.id, type, ...extractRefs(event), raw: event };
  };

  return { createPayment, getPayment, cancelPayment, refundPayment, parseWebhookEvent };
};

export { createStripePaymentProvider };
