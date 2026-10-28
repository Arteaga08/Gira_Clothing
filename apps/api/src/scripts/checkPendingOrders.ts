import mongoose from "mongoose";
import { OrderStatus } from "@gira/shared";
import { env } from "../config/env.js";

/**
 * Read-only check before the M16 index "one pending order per customer" is
 * built: lists customers who hold more than one pending_payment order, which
 * would make the unique index fail. It never writes. Pending orders expire on
 * their own when their reservation does (Settings.reservation.ttlMinutes), so
 * running it again a little later usually comes back clean.
 *
 * Reads the raw collection on purpose: importing the Order model would make
 * Mongoose try to build that very index on connect.
 *
 *   pnpm --filter @gira/api check:pending-orders
 */
const main = async (): Promise<void> => {
  await mongoose.connect(env.mongoUri, { autoIndex: false });
  console.log(`Base de datos: ${mongoose.connection.name} @ ${mongoose.connection.host}`);

  const duplicates = await mongoose.connection
    .collection("orders")
    .aggregate<{ _id: unknown; count: number; orderNumbers: string[] }>([
      { $match: { status: OrderStatus.PENDING_PAYMENT, user: { $exists: true } } },
      { $group: { _id: "$user", count: { $sum: 1 }, orderNumbers: { $push: "$orderNumber" } } },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();

  if (duplicates.length === 0) {
    console.log("Ningún cliente tiene más de un pedido por pagar: el índice se puede crear.");
  } else {
    console.log(`Clientes con más de un pedido por pagar: ${duplicates.length}`);
    for (const d of duplicates) {
      console.log(`- usuario ${String(d._id)}: ${d.orderNumbers.join(", ")}`);
    }
    console.log("Espera a que venzan (o cancélalos desde el panel) antes de crear el índice.");
  }
  await mongoose.disconnect();
};

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
