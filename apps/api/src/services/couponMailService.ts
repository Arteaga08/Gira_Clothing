import { getMailer } from "../adapters/mailer/index.js";
import { logger } from "../config/logger.js";
import { renderCouponGift, type CouponGiftInput } from "../templates/couponEmails.js";

/**
 * Sends the personal coupon straight to the provider (no outbox): the admin is waiting
 * on the answer and needs to know whether it went out. Never rejects; a failure is
 * logged without recipient or code and reported as `false` so the coupon still stands.
 */

type SendCouponEmailInput = CouponGiftInput & { to: string };

const sendCouponEmail = async ({ to, ...content }: SendCouponEmailInput): Promise<boolean> => {
  try {
    await getMailer().send({ to, ...renderCouponGift(content) });
    return true;
  } catch (err) {
    logger.error(
      { kind: "coupon_gift", reason: err instanceof Error ? err.message : "unknown" },
      "No se pudo enviar el correo de un cupón personal",
    );
    return false;
  }
};

export type { SendCouponEmailInput };
export { sendCouponEmail };
