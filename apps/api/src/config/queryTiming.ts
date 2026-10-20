import mongoose, { type Schema } from "mongoose";
import { logger } from "./logger.js";

/**
 * Development-only diagnostics: logs how long every Mongoose query and
 * aggregation takes, so slow round trips to a remote database are visible.
 * Registered globally, so it must be applied before any model is compiled.
 * Only operation names and durations are logged — never filters or data.
 */

const QUERY_OPS = [
  "find",
  "findOne",
  "findOneAndUpdate",
  "findOneAndDelete",
  "countDocuments",
  "estimatedDocumentCount",
  "distinct",
  "updateOne",
  "updateMany",
  "deleteOne",
  "deleteMany",
] as const;

const startKey = Symbol("queryTimingStart");

type Timed = { [startKey]?: number };

const log = (label: string, startedAt: number | undefined): void => {
  if (startedAt === undefined) return;
  logger.info({ ms: Math.round(performance.now() - startedAt) }, `db ${label}`);
};

const queryTimingPlugin = (schema: Schema): void => {
  for (const op of QUERY_OPS) {
    schema.pre(op, function () {
      (this as unknown as Timed)[startKey] = performance.now();
    });
    schema.post(op, function () {
      log(`${this.model.modelName}.${op}`, (this as unknown as Timed)[startKey]);
    });
  }
  schema.pre("aggregate", function () {
    (this as unknown as Timed)[startKey] = performance.now();
  });
  schema.post("aggregate", function () {
    log(`${this.model().modelName}.aggregate`, (this as unknown as Timed)[startKey]);
  });
};

const enableQueryTiming = (): void => {
  mongoose.plugin(queryTimingPlugin);
};

export { enableQueryTiming };
