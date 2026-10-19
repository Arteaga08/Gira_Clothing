import { Schema, model, type HydratedDocument, type Types } from "mongoose";

/**
 * One document per signed-in device. The session JWT carries this `_id` as
 * `sid`, and `protect` requires the document to still exist: logout deletes
 * one, "close every session" deletes them all (plus a tokenVersion bump).
 * Revocation is immediate because `protect` already reads the DB on every
 * request — which is why there is no refresh token (M8.5 decision).
 *
 * The TTL index removes expired documents, but Mongo sweeps only about once a
 * minute, so lookups also filter on `expiresAt`.
 */

interface SessionAttrs {
  user: Types.ObjectId;
  expiresAt: Date;
}

type SessionDocument = HydratedDocument<SessionAttrs>;

const sessionSchema = new Schema<SessionAttrs>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Session = model<SessionAttrs>("Session", sessionSchema);

export type { SessionAttrs, SessionDocument };
export { Session };
