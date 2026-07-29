import { logger } from "../../config/logger.js";
import type { NotificationChannel, TeamMessage } from "./types.js";

/**
 * Used whenever Telegram credentials are absent — which the spec allows in
 * EVERY environment, production included. The team channel is a convenience,
 * not a business guarantee, so its absence must never break a flow.
 */
const createStubChannel = (): NotificationChannel => ({
  notify: (message: TeamMessage): Promise<void> => {
    logger.info({ title: message.title }, "Aviso al equipo simulado (stub channel)");
    return Promise.resolve();
  },
});

export { createStubChannel };
