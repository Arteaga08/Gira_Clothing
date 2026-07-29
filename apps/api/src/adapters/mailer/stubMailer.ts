import { createHash } from "node:crypto";
import { logger } from "../../config/logger.js";
import type { Mailer, MailMessage, MailResult } from "./types.js";

/**
 * No-network fallback when RESEND_API_KEY is absent (dev/test). Deterministic:
 * same message -> same providerId, so tests can assert on it. Logs the subject
 * and a hash, NEVER the recipient or the body (BACKEND_SECURITY_GUIDELINES §11:
 * no PII in logs).
 */
const createStubMailer = (): Mailer => ({
  send: (message: MailMessage): Promise<MailResult> => {
    const hash = createHash("sha256")
      .update(`${message.to}|${message.subject}`)
      .digest("hex")
      .slice(0, 16);
    logger.info({ subject: message.subject, hash }, "Correo simulado (stub mailer)");
    return Promise.resolve({ providerId: `stub-${hash}` });
  },
});

export { createStubMailer };
