import mongoose from "mongoose";
import { env } from "../config/env.js";
import { Product } from "../models/Product.js";

/**
 * One-off: gives every product that has no weight a default (existing catalog
 * predates the field). DRY-RUN by default. It prints which database it points
 * at BEFORE doing anything so a wrong .env never touches the wrong cluster.
 *
 *   pnpm --filter @gira/api backfill:product-weight -- --grams 450          (dry-run)
 *   pnpm --filter @gira/api backfill:product-weight -- --grams 450 --apply
 */
const parseArgs = (argv: string[]): { grams: number; apply: boolean } => {
  const i = argv.indexOf("--grams");
  const grams = i >= 0 ? Number(argv[i + 1]) : Number.NaN;
  if (!Number.isInteger(grams) || grams < 1 || grams > 20_000) {
    throw new Error("Usa --grams <entero 1-20000>.");
  }
  return { grams, apply: argv.includes("--apply") };
};

const main = async (): Promise<void> => {
  const { grams, apply } = parseArgs(process.argv.slice(2));
  await mongoose.connect(env.mongoUri);
  console.log(`Base de datos: ${mongoose.connection.name} @ ${mongoose.connection.host}`);

  const filter = { $or: [{ weightGrams: { $exists: false } }, { weightGrams: null }] };
  const pending = await Product.collection.countDocuments(filter);
  console.log(`Productos sin peso: ${pending}`);

  if (!apply) {
    console.log(`Dry-run: no se escribió nada. Agrega --apply para asignar ${grams} g.`);
  } else {
    const result = await Product.collection.updateMany(filter, { $set: { weightGrams: grams } });
    console.log(`Actualizados: ${result.modifiedCount}`);
  }
  await mongoose.disconnect();
};

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
