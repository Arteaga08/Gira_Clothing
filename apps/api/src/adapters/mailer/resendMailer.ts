import type { MailConfig } from "../../config/env.js";
import { AppError } from "../../utils/AppError.js";
import type { Mailer, MailMessage, MailResult } from "./types.js";

/**
 * Resend over plain fetch — the whole API surface we need is one JSON POST, and
 * a provider SDK would add dependency (and audit) surface for nothing.
 *
 * Failures throw AppError(502) WITHOUT the provider's raw body: a 401 from
 * Resend can echo request details back, and this error text ends up in
 * Notification.lastError, which the admin panel will display. The API key never
 * appears in a message, a log, or a stored field.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;

const createResendMailer = (config: MailConfig): Mailer => ({
  send: async (message: MailMessage): Promise<MailResult> => {
    let response: Response;
    try {
      response = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: config.from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      // Network error or timeout: retryable, and the outbox will retry it.
      throw new AppError("No se pudo contactar al proveedor de correo.", 502);
    }

    if (!response.ok) {
      throw new AppError(
        `El proveedor de correo rechazó el envío (HTTP ${String(response.status)}).`,
        502,
      );
    }

    const body = (await response.json()) as { id?: string };
    return { providerId: body.id ?? "unknown" };
  },
});

export { createResendMailer };
