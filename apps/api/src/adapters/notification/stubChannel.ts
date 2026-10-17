import { logger } from "../../config/logger.js";
import type { NotificationChannel, NotifyResult, TeamMessage } from "./types.js";

/**
 * Used when Telegram credentials are absent, which only config validation
 * allows outside production. It reports `delivered: false` so the outbox records
 * the message as skipped instead of pretending somebody was told.
 */
const createStubChannel = (): NotificationChannel => ({
  notify: (message: TeamMessage): Promise<NotifyResult> => {
    logger.info({ title: message.title }, "Aviso al equipo simulado (stub channel)");
    return Promise.resolve({ delivered: false });
  },
});

export { createStubChannel };
