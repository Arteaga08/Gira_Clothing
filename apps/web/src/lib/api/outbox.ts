import type { OutboxHealth, Wire } from "@gira/shared";
import { expectData } from "./request";
import { browserRequest } from "./browser";
import { OUTBOX_HEALTH_PATH } from "./paths";

/**
 * Browser-only. This is the ONLY caller of the outbox endpoint that lives on
 * the client — the TopBar's notification bell polls it. It cannot import
 * stats.ts: that module pulls in server.ts, which imports next/headers, and
 * next/headers in a Client Component's bundle is a build error, not a
 * runtime one.
 */
const fetchOutboxHealth = async (): Promise<Wire<OutboxHealth>> =>
  expectData(await browserRequest<OutboxHealth>(OUTBOX_HEALTH_PATH));

export { fetchOutboxHealth };
