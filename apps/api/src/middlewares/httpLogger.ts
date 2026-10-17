import { pinoHttp } from "pino-http";
import type { Logger } from "pino";

/**
 * Request logger. Replaces the order's `publicId` in the logged URL: the id is
 * the credential for that order's PII, so it must never be written to disk
 * (BACKEND_SECURITY_GUIDELINES §11). `/orders/mine…` and the other fixed
 * segments are kept; only the opaque path segment after `/orders/` is masked.
 */

const ORDER_ID_IN_URL = /(\/orders\/)(?!mine(?:\/|\?|$))[^/?#]+/i; // Express routing is case-insensitive, so the mask must be too

const maskOrderUrl = (url: string | undefined): string | undefined =>
  url?.replace(ORDER_ID_IN_URL, "$1[redacted]");

const createHttpLogger = (logger: Logger) =>
  pinoHttp({
    logger,
    serializers: {
      req: (req: { id?: unknown; method?: string; url?: string }) => ({
        id: req.id,
        method: req.method,
        url: maskOrderUrl(req.url),
      }),
    },
  });

export { createHttpLogger, maskOrderUrl };
