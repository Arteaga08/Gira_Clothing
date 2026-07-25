import { env } from "./env.js";

/**
 * Single source of truth for allowed origins, shared by CORS and verifyOrigin
 * so the two can never drift (BACKEND_SECURITY_GUIDELINES §6, §12).
 * Localhost dev origins are whitelisted only outside production.
 */

const DEV_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];

const allowedOrigins: string[] =
  env.nodeEnv === "production"
    ? [env.clientUrl]
    : Array.from(new Set([env.clientUrl, ...DEV_ORIGINS]));

export { allowedOrigins };
