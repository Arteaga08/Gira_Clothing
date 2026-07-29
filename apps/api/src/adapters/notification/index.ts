import { env } from "../../config/env.js";
import { createTelegramChannel } from "./telegramChannel.js";
import { createStubChannel } from "./stubChannel.js";
import type { NotificationChannel } from "./types.js";

let cached: NotificationChannel | undefined;

const getNotificationChannel = (): NotificationChannel => {
  cached ??= env.telegram ? createTelegramChannel(env.telegram) : createStubChannel();
  return cached;
};

export type { TeamMessage, NotificationChannel } from "./types.js";
export { getNotificationChannel };
