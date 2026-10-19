import { getMailer } from "../adapters/mailer/index.js";
import { logger } from "../config/logger.js";
import { renderPasswordResetEmail, renderVerificationEmail } from "../templates/authEmails.js";
import type { RenderedMail } from "../templates/emailLayout.js";

/**
 * Account emails go straight to the provider (Resend), not through the
 * outbox: the outbox persists its payload, and the raw token must never be
 * stored. Callers fire and forget (`void send…`), so the response never waits
 * on the network — otherwise its timing would reveal whether an email was
 * sent, i.e. whether the account exists. Hence these never reject: a failure
 * is logged without recipient or token, and the person can ask for the link
 * again once the cooldown passes.
 */

interface AccountEmailRequest {
  to: string;
  token: string;
}

const deliver = async (kind: string, to: string, render: () => RenderedMail): Promise<void> => {
  try {
    await getMailer().send({ to, ...render() });
  } catch (err) {
    logger.error(
      { kind, reason: err instanceof Error ? err.message : "unknown" },
      "No se pudo enviar un correo de cuenta",
    );
  }
};

const sendVerificationEmail = ({ to, token }: AccountEmailRequest): Promise<void> =>
  deliver("email_verification", to, () => renderVerificationEmail({ token }));

const sendPasswordResetEmail = ({ to, token }: AccountEmailRequest): Promise<void> =>
  deliver("password_reset", to, () => renderPasswordResetEmail({ token }));

export type { AccountEmailRequest };
export { sendVerificationEmail, sendPasswordResetEmail };
