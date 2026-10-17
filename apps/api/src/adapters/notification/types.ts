/**
 * Internal team channel. Deliberately dumber than Mailer: a title and a list of
 * lines, because an operational ping is a glance, not a document. Keeping the
 * interface this narrow is what lets the stub be honest — it can render
 * everything the real channel renders.
 */

interface TeamMessage {
  title: string;
  lines: string[];
}

/** `delivered: false` = nothing left the building (channel not configured); never count it as sent. */
interface NotifyResult {
  delivered: boolean;
}

interface NotificationChannel {
  notify(message: TeamMessage): Promise<NotifyResult>;
}

export type { TeamMessage, NotifyResult, NotificationChannel };
