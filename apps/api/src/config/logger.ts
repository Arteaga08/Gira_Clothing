import { pino } from "pino";
import { env } from "./env.js";

/**
 * Structured logger with PII/secret redaction (BACKEND_SECURITY_GUIDELINES §11).
 * Never logs passwords, tokens, secrets, emails, cookies or auth headers.
 * `debug` is effectively silenced outside development via LOG_LEVEL.
 */

const redactPaths = [
  "req.headers.cookie",
  "req.headers.authorization",
  "*.password",
  "*.token",
  "*.secret",
  "*.email",
  "*.twoFactor",
  "password",
  "token",
  "secret",
  "email",
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
