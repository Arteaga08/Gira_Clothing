import type { TelegramConfig } from "../../config/env.js";
import { AppError } from "../../utils/AppError.js";
import type { NotificationChannel, TeamMessage } from "./types.js";

/**
 * Telegram Bot API over plain fetch. The bot token lives in the URL path, so no
 * error message here may ever echo the URL — it would leak the token into
 * Notification.lastError and into the logs.
 */

const TIMEOUT_MS = 10_000;

const render = (message: TeamMessage): string =>
  [message.title, "", ...message.lines].join("\n");

const createTelegramChannel = (config: TelegramConfig): NotificationChannel => ({
  notify: async (message: TeamMessage): Promise<void> => {
    let response: Response;
    try {
      response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: config.chatId,
          text: render(message),
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new AppError("No se pudo contactar al canal de notificaciones.", 502);
    }

    if (!response.ok) {
      throw new AppError(
        `El canal de notificaciones rechazó el mensaje (HTTP ${String(response.status)}).`,
        502,
      );
    }
  },
});

export { createTelegramChannel };
