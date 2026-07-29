import mongoose from "mongoose";
import { AuditAction, AuditModule, ReservationStatus } from "@gira/shared";
import { Variant } from "../models/Variant.js";
import { StockReservation, PURGE_AFTER_DAYS, type ReservationLine } from "../models/StockReservation.js";
import { AppError } from "../utils/AppError.js";
import { recordAudit } from "./auditService.js";
import type { RequestContext } from "../utils/requestContext.js";

/**
 * The bridge between "the customer intends to buy" and "the customer paid".
 * The ONLY module allowed to write Variant.reserved.
 *
 * Three invariants, in order of importance:
 *
 * 1. NEVER read-then-write. The availability condition lives inside the
 *    findOneAndUpdate filter (M2's rule), so two racing checkouts are
 *    serialized by Mongo: one wins, the other gets null without ever touching
 *    the winner's document.
 * 2. N variants + 1 reservation is ONE unit of work. session.withTransaction
 *    makes all N+1 writes land together or not at all — without it, a crash
 *    mid-loop leaves reserved inflated (phantom stock) or over-decremented
 *    (oversell). withTransaction RETRIES its callback on transient errors, so
 *    the callback must stay idempotent; an aborted attempt leaves no trace, and
 *    a business AppError aborts without retry.
 * 3. Commit and release are exactly-once. The atomic flip on `status: ACTIVE`
 *    is the ticket: twenty concurrent commits compete for it and exactly one
 *    wins. Everyone else gets null and no-ops — which is what makes a
 *    re-delivered Stripe webhook harmless.
 *
 * Deactivated variants are unreservable (`isActive: true` sits in the filter):
 * a retired variant, or one orphaned by a retired product/print, must never be
 * sellable. Parent activity is validated upstream in pricingService, which
 * loads product and print to price the line anyway.
 */

const OUT_OF_STOCK = "Uno de los artículos ya no tiene existencias suficientes.";

const purgeDate = (): Date => new Date(Date.now() + PURGE_AFTER_DAYS * 24 * 60 * 60 * 1000);

const reserveStock = async (
  orderId: mongoose.Types.ObjectId,
  lines: ReservationLine[],
  ttlMinutes: number,
  ctx: RequestContext,
): Promise<void> => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (const line of lines) {
        const held = await Variant.findOneAndUpdate(
          {
            _id: line.variant,
            isActive: true,
            $expr: { $gte: [{ $subtract: ["$onHand", "$reserved"] }, line.qty] },
          },
          { $inc: { reserved: line.qty } },
          { new: true, session },
        )
          .select("_id")
          .lean();

        if (!held) throw new AppError(OUT_OF_STOCK, 409);
      }

      await StockReservation.create(
        [
          {
            order: orderId,
            lines,
            status: ReservationStatus.ACTIVE,
            expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000),
            purgeAt: null,
          },
        ],
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  await recordAudit({
    actorId: ctx.actorId,
    actorType: ctx.actorId ? "user" : "system",
    action: AuditAction.STOCK_RESERVED,
    module: AuditModule.ORDERS,
    targetId: String(orderId),
    after: { lines: lines.length, ttlMinutes },
    ip: ctx.ip,
  });
};

/** Payment confirmed: the held units leave the warehouse for good. Idempotent. */
const commitReservation = async (orderId: mongoose.Types.ObjectId): Promise<boolean> => {
  let applied = false;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const reservation = await StockReservation.findOneAndUpdate(
        { order: orderId, status: ReservationStatus.ACTIVE },
        { $set: { status: ReservationStatus.COMMITTED, purgeAt: purgeDate() } },
        { new: true, session },
      );
      // Already terminal (or never existed) -> nothing to do. This is the
      // idempotency guarantee a re-delivered webhook relies on.
      if (!reservation) return;

      for (const line of reservation.lines) {
        await Variant.updateOne(
          { _id: line.variant },
          { $inc: { onHand: -line.qty, reserved: -line.qty } },
          { session },
        );
      }
      applied = true;
    });
  } finally {
    await session.endSession();
  }

  if (applied) {
    await recordAudit({
      actorType: "system",
      action: AuditAction.STOCK_RESERVATION_COMMITTED,
      module: AuditModule.ORDERS,
      targetId: String(orderId),
    });
  }
  return applied;
};

/** Payment failed, cancelled, expired or abandoned: give the units back. Idempotent. */
const releaseReservation = async (
  orderId: mongoose.Types.ObjectId,
  reason: string,
): Promise<boolean> => {
  let applied = false;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const reservation = await StockReservation.findOneAndUpdate(
        { order: orderId, status: ReservationStatus.ACTIVE },
        {
          $set: {
            status: ReservationStatus.RELEASED,
            purgeAt: purgeDate(),
            releasedReason: reason,
          },
        },
        { new: true, session },
      );
      if (!reservation) return;

      for (const line of reservation.lines) {
        await Variant.updateOne(
          { _id: line.variant },
          { $inc: { reserved: -line.qty } },
          { session },
        );
      }
      applied = true;
    });
  } finally {
    await session.endSession();
  }

  if (applied) {
    await recordAudit({
      actorType: "system",
      action: AuditAction.STOCK_RESERVATION_RELEASED,
      module: AuditModule.ORDERS,
      targetId: String(orderId),
      after: { reason },
    });
  }
  return applied;
};

export { reserveStock, commitReservation, releaseReservation, OUT_OF_STOCK };
