import { pino, type DestinationStream, type Logger } from "pino";
import { env } from "./env.js";

/**
 * Structured logger with PII/secret redaction (BACKEND_SECURITY_GUIDELINES §11).
 * Never logs passwords, tokens, secrets, emails, cookies or auth headers.
 * `debug` is effectively silenced outside development via LOG_LEVEL.
 */

/**
 * A pino wildcard matches ONE level, so `*.email` covers `err.email` but not
 * `err.keyValue.email` — which is exactly where a Mongo duplicate-key error
 * puts the address. Every level a sensitive value can realistically appear at
 * is listed explicitly; `**` is deliberately avoided (it walks the whole object
 * on every log line).
 */
const SENSITIVE = [
  "password",
  "token",
  "secret",
  "email",
  "phone",
  "twoFactor",
  // Enrolment payload: the TOTP key and the QR that encodes it.
  "manualKey",
  "qrDataUrl",
];

const redactPaths = [
  "req.headers.cookie",
  "req.headers.authorization",
  // The session JWT travels in Set-Cookie on login: pino-http logs response
  // headers, so without this the token lands in the log (it is a live session).
  'res.headers["set-cookie"]',
  // publicId is a credential for the order's PII (anti-IDOR design).
  "req.params.publicId",
  ...SENSITIVE,
  ...SENSITIVE.map((key) => `*.${key}`),
  ...SENSITIVE.map((key) => `*.*.${key}`),
  ...SENSITIVE.map((key) => `*.*.*.${key}`),
];

const isDev = env.nodeEnv === "development";

/**
 * Factory so tests can capture the output in memory. `destination` and `level`
 * default to the real stdout/pretty transport and LOG_LEVEL.
 */
const createLogger = (destination?: DestinationStream, level: string = env.logLevel): Logger => {
  const options = {
    level,
    redact: { paths: redactPaths, censor: "[redacted]" },
  };
  if (destination) return pino(options, destination);
  return pino({
    ...options,
    ...(isDev
      ? { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard" } } }
      : {}),
  });
};

const logger = createLogger();

export { logger, createLogger };
