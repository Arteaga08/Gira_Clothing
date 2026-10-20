import { createHash, randomBytes } from "node:crypto";
import type { Types } from "mongoose";
import {
  SHIPPING_CARRIER_LABELS,
  type Currency,
  type ShippingProviderName,
  type ShippingParcel,
  type ShippingQuoteResponse,
} from "@gira/shared";
import { getShippingProvider, ShippingProviderError } from "../adapters/shipping/index.js";
import { ShippingQuote, type QuotedRate } from "../models/ShippingQuote.js";
import { AppError } from "../utils/AppError.js";
import { convertFromMxn } from "../utils/money.js";
import { computeParcel } from "./parcelService.js";
import { resolveOrderLines, type RequestedLine, type ResolvedLine } from "./pricingService.js";
import { getSettings } from "./settingsService.js";

const PURGE_AFTER_EXPIRY_MS = 24 * 60 * 60 * 1000;

interface QuoteDestination {
  postalCode: string;
  state: string;
  city: string;
}

interface CreateQuoteInput {
  lines: RequestedLine[];
  currency: Currency;
  destination: QuoteDestination;
}

interface QuoteContext {
  userId?: Types.ObjectId | undefined;
}

const buildFingerprint = (
  lines: Array<{ variantId: string; qty: number }>,
  postalCode: string,
  currency: Currency,
): string =>
  createHash("sha256")
    .update(
      JSON.stringify({
        lines: [...lines].sort((a, b) => a.variantId.localeCompare(b.variantId)),
        postalCode,
        currency,
      }),
    )
    .digest("hex");

const fingerprintOf = (resolved: ResolvedLine[], postalCode: string, currency: Currency): string =>
  buildFingerprint(
    resolved.map((l) => ({ variantId: String(l.variant), qty: l.qty })),
    postalCode,
    currency,
  );

const createShippingQuote = async (
  input: CreateQuoteInput,
  ctx: QuoteContext,
): Promise<ShippingQuoteResponse> => {
  const settings = await getSettings();
  const origin = settings.shipping.origin;
  if (!origin) throw new AppError("El envío no está disponible por ahora.", 503);
  if (!settings.currency.supported.includes(input.currency)) {
    throw new AppError("La moneda seleccionada no está disponible.", 400);
  }

  const resolved = await resolveOrderLines(input.lines);
  const parcel = computeParcel(
    resolved.map((l) => ({ weightGrams: l.weightGrams, qty: l.qty })),
    settings.shipping.parcel,
  );
  const subtotalMxn = resolved.reduce((sum, l) => sum + l.unitPriceMxn * l.qty, 0);

  const provider = getShippingProvider();
  let providerRates;
  try {
    providerRates = await provider.getRates(
      {
        origin: {
          name: origin.name,
          phone: origin.phone,
          ...(origin.email ? { email: origin.email } : {}),
          line1: origin.line1,
          district: origin.district,
          city: origin.city,
          state: origin.state,
          postalCode: origin.postalCode,
        },
        // The full address is not known yet: carriers only price by postal code.
        destination: {
          name: "Cliente Gira",
          phone: origin.phone,
          line1: "Domicilio conocido",
          district: "Centro",
          city: input.destination.city,
          state: input.destination.state,
          postalCode: input.destination.postalCode,
        },
        parcel,
        declaredValueMxn: subtotalMxn,
      },
      {},
    );
  } catch (err) {
    if (err instanceof ShippingProviderError && err.kind === "rejected") {
      throw new AppError("No pudimos cotizar el envío con ese código postal. Revísalo.", 422);
    }
    throw new AppError("No pudimos cotizar el envío. Intenta de nuevo en unos minutos.", 502);
  }
  if (providerRates.length === 0) {
    throw new AppError("No hay paquetería disponible para ese código postal.", 422);
  }

  const threshold = settings.shipping.freeShippingThreshold;
  const free = threshold !== null && subtotalMxn >= threshold;
  const { mxnPerUsdCents, rounding } = settings.currency;

  const rates: QuotedRate[] = providerRates
    .map((r) => ({
      rateId: randomBytes(12).toString("hex"),
      carrier: r.carrier,
      service: r.service,
      serviceName: r.serviceName,
      estimatedDays: r.estimatedDays,
      costMxn: r.costMxn,
      amountMxn: free ? 0 : r.costMxn,
    }))
    .sort((a, b) => a.amountMxn - b.amountMxn || a.estimatedDays - b.estimatedDays);

  const expiresAt = new Date(Date.now() + settings.shipping.quoteTtlMinutes * 60_000);
  const quoteId = randomBytes(24).toString("base64url");
  await ShippingQuote.create({
    quoteId,
    ...(ctx.userId ? { user: ctx.userId } : {}),
    fingerprint: fingerprintOf(resolved, input.destination.postalCode, input.currency),
    currency: input.currency,
    provider: provider.name,
    parcel,
    rates,
    expiresAt,
    purgeAt: new Date(expiresAt.getTime() + PURGE_AFTER_EXPIRY_MS),
  });

  return {
    quoteId,
    currency: input.currency,
    expiresAt: expiresAt.toISOString(),
    rates: rates.map((r) => ({
      rateId: r.rateId,
      carrier: r.carrier,
      carrierName: SHIPPING_CARRIER_LABELS[r.carrier],
      service: r.service,
      serviceName: r.serviceName,
      amount: convertFromMxn(r.amountMxn, input.currency, mxnPerUsdCents, rounding),
      estimatedDays: r.estimatedDays,
    })),
  };
};

interface ResolveRateInput {
  quoteId: string;
  rateId: string;
  resolved: ResolvedLine[];
  postalCode: string;
  currency: Currency;
  userId?: Types.ObjectId | undefined;
}

interface ResolvedRate {
  rate: QuotedRate & { provider: ShippingProviderName };
  parcel: ShippingParcel;
}

/** Validates a stored quote against what the order is actually being created for. */
const resolveQuotedRate = async (input: ResolveRateInput): Promise<ResolvedRate> => {
  const quote = await ShippingQuote.findOne({ quoteId: input.quoteId }).lean();
  const invalid = (message: string): AppError => new AppError(message, 409);

  if (!quote || quote.expiresAt.getTime() <= Date.now()) {
    throw invalid("La cotización de envío venció. Vuelve a elegir tu envío.");
  }
  if (quote.user && String(quote.user) !== String(input.userId ?? "")) {
    throw invalid("La cotización de envío no es válida. Vuelve a elegir tu envío.");
  }
  if (quote.currency !== input.currency) {
    throw invalid("La moneda cambió. Vuelve a elegir tu envío.");
  }
  if (quote.fingerprint !== fingerprintOf(input.resolved, input.postalCode, input.currency)) {
    throw invalid("Tu carrito o tu código postal cambió. Vuelve a elegir tu envío.");
  }
  const rate = quote.rates.find((r) => r.rateId === input.rateId);
  if (!rate) throw invalid("La opción de envío no es válida. Vuelve a elegir tu envío.");

  return { rate: { ...rate, provider: quote.provider }, parcel: quote.parcel };
};

export type { CreateQuoteInput, QuoteContext, ResolvedRate };
export { createShippingQuote, resolveQuotedRate, buildFingerprint };
