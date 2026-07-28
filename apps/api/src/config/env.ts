import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Fail-fast environment loader (BACKEND_SECURITY_GUIDELINES §9).
 *
 * `loadEnv(source)` is pure and injectable so it can be unit-tested without
 * touching process.env. The eager `env` singleton at the bottom runs once at
 * import time against the real process.env and is frozen — importable anywhere.
 */

const NODE_ENVS = ["production", "development", "test"] as const;
type NodeEnv = (typeof NODE_ENVS)[number];

const MIN_SECRET_LENGTH = 48;

interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  folder: string;
}

interface Env {
  nodeEnv: NodeEnv;
  port: number;
  mongoUri: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  encryptionKey: string;
  clientUrl: string;
  cookieName: string;
  logLevel: string;
  /** null outside production when no provider is configured -> stub adapter. */
  cloudinary: CloudinaryConfig | null;
}

const requireVar = (source: NodeJS.ProcessEnv, key: string, errors: string[]): string => {
  const value = source[key]?.trim();
  if (!value) {
    errors.push(`Falta la variable de entorno requerida: ${key}`);
    return "";
  }
  return value;
};

const requireLength = (
  source: NodeJS.ProcessEnv,
  key: string,
  min: number,
  errors: string[],
): string => {
  const value = requireVar(source, key, errors);
  if (value && value.length < min) {
    errors.push(`${key} debe tener al menos ${min} caracteres (tiene ${value.length}).`);
  }
  return value;
};

const loadEnv = (source: NodeJS.ProcessEnv = process.env): Readonly<Env> => {
  const errors: string[] = [];

  const nodeEnvRaw = source.NODE_ENV?.trim();
  if (!nodeEnvRaw || !NODE_ENVS.includes(nodeEnvRaw as NodeEnv)) {
    errors.push(`NODE_ENV debe ser uno de: ${NODE_ENVS.join(", ")} (recibido: ${nodeEnvRaw ?? "vacío"}).`);
  }
  const nodeEnv = nodeEnvRaw as NodeEnv;

  const portRaw = requireVar(source, "PORT", errors);
  const port = Number(portRaw);
  if (portRaw && (Number.isNaN(port) || port <= 0)) {
    errors.push(`PORT debe ser un número positivo (recibido: ${portRaw}).`);
  }

  const mongoUri = requireVar(source, "MONGODB_URI", errors);
  const jwtSecret = requireLength(source, "JWT_SECRET", MIN_SECRET_LENGTH, errors);
  const jwtExpiresIn = requireVar(source, "JWT_EXPIRES_IN", errors);
  const encryptionKey = requireLength(source, "ENCRYPTION_KEY", MIN_SECRET_LENGTH, errors);
  const clientUrl = requireVar(source, "CLIENT_URL", errors);
  const cookieName = requireVar(source, "COOKIE_NAME", errors);
  const logLevel = source.LOG_LEVEL?.trim() || "info";

  // In production the public client URL must be HTTPS (cookies are `secure`).
  if (nodeEnv === "production" && clientUrl && !clientUrl.startsWith("https://")) {
    errors.push("En producción CLIENT_URL debe usar https://.");
  }

  const cloudFolder = source.CLOUDINARY_FOLDER?.trim() || "gira";
  let cloudinary: CloudinaryConfig | null = null;

  if (nodeEnv === "production") {
    // In production the real provider is mandatory — no silent stub uploads.
    const cloudName = requireVar(source, "CLOUDINARY_CLOUD_NAME", errors);
    const apiKey = requireVar(source, "CLOUDINARY_API_KEY", errors);
    const apiSecret = requireVar(source, "CLOUDINARY_API_SECRET", errors);
    if (cloudName && apiKey && apiSecret) {
      cloudinary = { cloudName, apiKey, apiSecret, folder: cloudFolder };
    }
  } else {
    const cloudName = source.CLOUDINARY_CLOUD_NAME?.trim();
    const apiKey = source.CLOUDINARY_API_KEY?.trim();
    const apiSecret = source.CLOUDINARY_API_SECRET?.trim();
    // All three or none — a half-configured provider fails at request time instead.
    if (cloudName && apiKey && apiSecret) {
      cloudinary = { cloudName, apiKey, apiSecret, folder: cloudFolder };
    } else if (cloudName || apiKey || apiSecret) {
      errors.push(
        "Configuración de Cloudinary incompleta: define CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET, o ninguna.",
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Configuración de entorno inválida:\n  - ${errors.join("\n  - ")}`,
    );
  }

  return Object.freeze<Env>({
    nodeEnv,
    port,
    mongoUri,
    jwtSecret,
    jwtExpiresIn,
    encryptionKey,
    clientUrl,
    cookieName,
    logLevel,
    cloudinary,
  });
};

// Eager load: read the matching .env file before building the singleton, so
// process.env is populated when loadEnv() runs. .env.*.local is git-ignored.
const nodeEnv = process.env.NODE_ENV ?? "development";
const envFile = resolve(process.cwd(), `.env.${nodeEnv}.local`);
if (existsSync(envFile)) {
  loadDotenv({ path: envFile });
}

const env = loadEnv();

export type { Env, NodeEnv, CloudinaryConfig };
export { loadEnv, env };
