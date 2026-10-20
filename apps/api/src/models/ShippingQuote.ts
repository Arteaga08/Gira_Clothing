import { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";
import { Currency, ShippingCarrier, ShippingProviderName } from "@gira/shared";

/**
 * A quote kept on the SERVER: the client never sends a shipping amount, only
 * {quoteId, rateId}. `rateId` is our own opaque id (the provider's ids never
 * reach the client). `fingerprint` ties the quote to the exact cart + postal
 * code + currency it was made for. A TTL index purges it a day after it expires.
 */

interface QuotedRate {
  rateId: string;
  carrier: ShippingCarrier;
  service: string;
  serviceName: string;
  estimatedDays: number;
  /** What the provider charges us, MXN centavos. */
  costMxn: number;
  /** What the customer pays, MXN centavos (0 when free shipping applies). */
  amountMxn: number;
}

interface ShippingQuoteAttrs {
  quoteId: string;
  user?: Types.ObjectId;
  fingerprint: string;
  currency: Currency;
  provider: ShippingProviderName;
  parcel: { weightGrams: number; lengthCm: number; widthCm: number; heightCm: number };
  rates: QuotedRate[];
  expiresAt: Date;
  purgeAt: Date;
}

type ShippingQuoteModel = Model<ShippingQuoteAttrs>;
type ShippingQuoteDocument = HydratedDocument<ShippingQuoteAttrs>;

const rateSchema = new Schema<QuotedRate>(
  {
    rateId: { type: String, required: true },
    carrier: { type: String, enum: Object.values(ShippingCarrier), required: true },
    service: { type: String, required: true },
    serviceName: { type: String, required: true },
    estimatedDays: { type: Number, required: true, min: 0 },
    costMxn: { type: Number, required: true, min: 0 },
    amountMxn: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const shippingQuoteSchema = new Schema<ShippingQuoteAttrs, ShippingQuoteModel>(
  {
    quoteId: { type: String, required: true },
    user: { type: Schema.Types.ObjectId, ref: "User" },
    fingerprint: { type: String, required: true },
    currency: { type: String, enum: Object.values(Currency), required: true },
    provider: { type: String, enum: Object.values(ShippingProviderName), required: true },
    parcel: {
      weightGrams: { type: Number, required: true },
      lengthCm: { type: Number, required: true },
      widthCm: { type: Number, required: true },
      heightCm: { type: Number, required: true },
    },
    rates: { type: [rateSchema], required: true },
    expiresAt: { type: Date, required: true },
    purgeAt: { type: Date, required: true },
  },
  { timestamps: true },
);

shippingQuoteSchema.index({ quoteId: 1 }, { unique: true });
// Garbage collection only: validity is decided by `expiresAt` in the service.
shippingQuoteSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

const ShippingQuote = model<ShippingQuoteAttrs, ShippingQuoteModel>(
  "ShippingQuote",
  shippingQuoteSchema,
);

export type { QuotedRate, ShippingQuoteAttrs, ShippingQuoteDocument };
export { ShippingQuote };
