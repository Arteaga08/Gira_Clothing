import { vi, type MockInstance } from "vitest";
import { getMailer, type MailMessage } from "../../src/adapters/mailer/index.js";

/**
 * Account emails are fire-and-forget (the response never waits on the
 * provider), so a test spies on the mailer and waits for the call instead of
 * asserting right after the request returns. The raw token only ever exists
 * inside the email: the DB holds its hash.
 */

type MailSpy = MockInstance<(message: MailMessage) => Promise<{ providerId: string }>>;

type LinkKind = "verificar-correo" | "restablecer-contrasena";

const spyOnMailer = (): MailSpy => vi.spyOn(getMailer(), "send");

const sentTo = (spy: MailSpy, to: string): MailMessage[] =>
  spy.mock.calls.map(([message]) => message).filter((message) => message.to === to);

/** Waits until `count` emails reached `to` and returns the token in the last one's link. */
const waitForToken = async (
  spy: MailSpy,
  to: string,
  kind: LinkKind,
  count = 1,
): Promise<string> => {
  await vi.waitFor(() => {
    if (sentTo(spy, to).length < count) throw new Error("correo aún no enviado");
  });
  const last = sentTo(spy, to).at(-1)!;
  const match = new RegExp(`/${kind}\\?token=([a-f0-9]{64})`).exec(last.text);
  if (!match) throw new Error(`El correo no trae un enlace a /${kind}`);
  return match[1]!;
};

/** Gives any pending fire-and-forget send a chance to run before asserting "nothing was sent". */
const flushMail = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 50));

export type { MailSpy };
export { spyOnMailer, sentTo, waitForToken, flushMail };
