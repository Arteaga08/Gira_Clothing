import { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";

/**
 * Persisted cart — logged-in customers only. A guest builds their cart in the
 * browser and posts the lines at checkout: a server-side guest cart would need
 * an anonymous session cookie and a second expiring object to reconcile, for a
 * shopper who is not coming back from another device.
 *
 * A cart holds NO stock. Nothing is reserved until an order is created, so an
 * abandoned cart can never strand inventory.
 *
 * Prices are NOT stored here. The cart quotes live catalog prices on every
 * read; freezing a price is exclusively an Order concern (the snapshot).
 *
 * Expiry uses `expiresAt` + expireAfterSeconds: 0 rather than a fixed
 * expireAfterSeconds, so the idle window stays configurable from Settings
 * (expireAfterSeconds is baked into the index at creation time).
 */

interface CartLine {
  variant: Types.ObjectId;
  qty: number;
}

interface CartAttrs {
  user: Types.ObjectId;
  lines: CartLine[];
  expiresAt: Date;
}

type CartModel = Model<CartAttrs>;
type CartDocument = HydratedDocument<CartAttrs>;

const cartLineSchema = new Schema<CartLine>(
  {
    variant: { type: Schema.Types.ObjectId, ref: "Variant", required: true },
    qty: { type: Number, required: true, min: 1, max: 20 },
  },
  { _id: false },
);

const cartSchema = new Schema<CartAttrs, CartModel>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    lines: { type: [cartLineSchema], default: [] },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

cartSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Cart = model<CartAttrs, CartModel>("Cart", cartSchema);

export type { CartAttrs, CartDocument, CartLine };
export { Cart };
