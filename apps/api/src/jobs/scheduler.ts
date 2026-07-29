import { logger } from "../config/logger.js";
import { expireReservations } from "./expireReservations.js";
import { reconcilePayments } from "./reconcilePayments.js";
import { dispatchNotifications } from "./dispatchNotifications.js";

/**
 * Lightweight cron: plain intervals, no BullMQ and no Redis (spec trade-off —
 * zero extra infra, at the cost of retries with backoff and job visibility).
 * Started ONLY from server.ts, never from buildApp(), so supertest never
 * inherits a timer that outlives the test run.
 *
 * `unref()` keeps these timers from holding the process open during shutdown.
 */
const EVERY_MINUTE = 60 * 1000;
const EVERY_FIVE_MINUTES = 5 * 60 * 1000;

let timers: NodeJS.Timeout[] = [];

const runSafely =
  (name: string, job: () => Promise<unknown>) =>
  (): void => {
    job().catch((err: unknown) => logger.error({ err, job: name }, "Job en background falló"));
  };

const startJobs = (): void => {
  timers = [
    setInterval(runSafely("expireReservations", expireReservations), EVERY_MINUTE),
    setInterval(runSafely("reconcilePayments", reconcilePayments), EVERY_FIVE_MINUTES),
    setInterval(runSafely("dispatchNotifications", dispatchNotifications), EVERY_MINUTE),
  ];
  for (const timer of timers) timer.unref();
  logger.info("Jobs en background iniciados");
};

const stopJobs = (): void => {
  for (const timer of timers) clearInterval(timer);
  timers = [];
};

export { startJobs, stopJobs };
