import { env } from "../../config/env.js";
import { createResendMailer } from "./resendMailer.js";
import { createStubMailer } from "./stubMailer.js";
import type { Mailer } from "./types.js";

let cached: Mailer | undefined;

/** Provider chosen by configuration, never by conditionals in business code. */
const getMailer = (): Mailer => {
  cached ??= env.mail ? createResendMailer(env.mail) : createStubMailer();
  return cached;
};

export type { MailMessage, MailResult, Mailer } from "./types.js";
export { getMailer };
