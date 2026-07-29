import { pino } from "pino";
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
const SENSITIVE = ["password", "token", "secret", "email", "phone", "twoFactor"];

const redactPaths = [
  "req.headers.cookie",
  "req.headers.authorization",
  ...SENSITIVE,
  ...SENSITIVE.map((key) => `*.${key}`),
  ...SENSITIVE.map((key) => `*.*.${key}`),
  ...SENSITIVE.map((key) => `*.*.*.${key}`),
];

const isDev = env.nodeEnv === "development";

const logger = pino({
  level: env.logLevel,
  redact: { paths: redactPaths, censor: "[redacted]" },
  ...(isDev
    ? { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard" } } }
    : {}),
});

export { logger };
