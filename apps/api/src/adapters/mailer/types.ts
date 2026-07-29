/**
 * Narrow, domain-owned mail interface. No provider type crosses this boundary,
 * so swapping Resend for anything else is one new file here and nothing else.
 * The caller passes an already-rendered message: templates live in src/templates/,
 * never inside an adapter.
 */

interface MailMessage {
  to: string;
  subject: string;
  html: string;
  /** Plain-text fallback. Always sent — some clients never render the HTML part. */
  text: string;
}

interface MailResult {
  providerId: string;
}

interface Mailer {
  send(message: MailMessage): Promise<MailResult>;
}

export type { MailMessage, MailResult, Mailer };
