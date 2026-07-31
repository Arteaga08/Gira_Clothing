import type { ApiResult, RequestOptions } from "./request";
import { request } from "./request";

/**
 * The only entry point mutations may use. Spec §6 is vinculante: every
 * mutating call must leave the browser with a real `Origin` header so
 * `verifyOrigin` (apps/api/src/middlewares/verifyOrigin.ts) can check it — a
 * call made from a Server Component or Server Action would carry no such
 * header and silently bypass that CSRF defence. Guarding this at runtime, not
 * just in a comment, is why it throws instead of degrading.
 */
const browserRequest = async <T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> => {
  if (typeof window === "undefined") {
    throw new Error("browserRequest solo puede usarse en el navegador.");
  }
  return request<T>(path, { ...options, credentials: "include" });
};

export { browserRequest };
