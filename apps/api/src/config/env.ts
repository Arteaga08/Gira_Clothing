import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { ShippingCarrier } from "@gira/shared";

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

interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  /** Signature timestamp tolerance in seconds (anti-replay). */
  webhookToleranceSeconds: number;
}

interface MailConfig {
  apiKey: string;
  /** Verified sender, e.g. "Gira Clothing <hola@giraclothing.mx>". */
  from: string;
}

interface TelegramConfig {
  botToken: string;
  chatId: string;
}

interface EnviaConfig {
  apiToken: string;
  /** Sandbox and production use different hosts AND different tokens. */
  environment: "sandbox" | "production";
  /** One rate call is made per carrier in this list. */
  carriers: ShippingCarrier[];
  /** null = the webhook endpoint answers 503 and tracking relies on polling. */
  webhookSecret: string | null;
  webhookToleranceMs: number;
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
  /**
   * How many reverse proxies sit in front of the API. 0 = none (local).
   * Feeds Express's `trust proxy`, which decides what `req.ip` resolves to —
   * and therefore what every rate limiter buckets by and what the audit trail
   * records. Behind a proxy with 0, every request looks like it came from the
   * proxy: the login limiter locks out the whole world after 5 failures and
   * the audit log stores one useless IP. A HOP COUNT, never `true`: trusting
   * the whole chain makes X-Forwarded-For attacker-controlled and hands the
   * limiters back to the attacker.
   */
  trustProxyHops: number;
  /**
   * `Secure` flag of the session cookie. An explicit variable instead of
   * inferring it from NODE_ENV, so a staging/preview environment that is not
   * literally "production" never silently inherits the insecure dev behaviour.
   * Defaults to true everywhere; only development turns it off (plain http).
   */
  cookieSecure: boolean;
  /** Same reasoning as `cookieSecure`: default ON, dev/test opt out explicitly. */
  rateLimitEnabled: boolean;
  /** null outside production when no provider is configured -> stub adapter. */
  cloudinary: CloudinaryConfig | null;
  /** null outside production when no provider is configured -> stub adapter. */
  stripe: StripeConfig | null;
  /** null outside production when no provider is configured -> stub mailer. */
  mail: MailConfig | null;
  /** null only outside production when credentials are absent -> stub channel. */
  telegram: TelegramConfig | null;
  /** null outside production when no token is configured -> stub shipping adapter. */
  envia: EnviaConfig | null;
  /** Dev/test only: lets the stub shipping adapter accept signed webhooks. Forbidden in production. */
  stubShippingWebhookSecret: string | null;
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

/**
 * Strict boolean flag: only true/false/1/0 are valid. Anything else is a
 * typo that would otherwise be read as "off" (or "on") by accident.
 */
const parseBooleanFlag = (raw: string | undefined, fallback: boolean): boolean | null => {
  const value = raw?.trim().toLowerCase();
  if (!value) return fallback;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return null;
};

const loadEnv = (source: NodeJS.ProcessEnv = process.env): Readonly<Env> => {
  const errors: string[] = [];

  const nodeEnvRaw = source.NODE_ENV?.trim();
  if (!nodeEnvRaw || !NODE_ENVS.includes(nodeEnvRaw as NodeEnv)) {
    errors.push(
      `NODE_ENV debe ser uno de: ${NODE_ENVS.join(", ")} (recibido: ${nodeEnvRaw ?? "vacío"}).`,
    );
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

  const hopsRaw = source.TRUST_PROXY_HOPS?.trim();
  const trustProxyHops = hopsRaw ? Number(hopsRaw) : 0;
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0) {
    errors.push("TRUST_PROXY_HOPS debe ser un entero mayor o igual a 0.");
  }

  // Security switches: ON by default in every environment; production refuses
  // to boot with either one off, so a copied dev .env can never weaken it.
  const readSecurityFlag = (key: "COOKIE_SECURE" | "RATE_LIMIT_ENABLED"): boolean => {
    const parsed = parseBooleanFlag(source[key], true);
    if (parsed === null) {
      errors.push(`${key} debe ser true o false (recibido: ${source[key]}).`);
      return true;
    }
    if (nodeEnv === "production" && !parsed) {
      errors.push(`En producción ${key} no puede ser false.`);
    }
    return parsed;
  };
  const cookieSecure = readSecurityFlag("COOKIE_SECURE");
  const rateLimitEnabled = readSecurityFlag("RATE_LIMIT_ENABLED");

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

  const toleranceRaw = source.STRIPE_WEBHOOK_TOLERANCE_SECONDS?.trim();
  const webhookToleranceSeconds = toleranceRaw ? Number(toleranceRaw) : 300;
  if (!Number.isInteger(webhookToleranceSeconds) || webhookToleranceSeconds <= 0) {
    errors.push("STRIPE_WEBHOOK_TOLERANCE_SECONDS debe ser un entero positivo de segundos.");
  }

  let stripe: StripeConfig | null = null;

  if (nodeEnv === "production") {
    // In production the real provider is mandatory — no silent stub charges.
    const secretKey = requireVar(source, "STRIPE_SECRET_KEY", errors);
    const webhookSecret = requireVar(source, "STRIPE_WEBHOOK_SECRET", errors);
    if (secretKey && webhookSecret) {
      stripe = { secretKey, webhookSecret, webhookToleranceSeconds };
    }
  } else {
    const secretKey = source.STRIPE_SECRET_KEY?.trim();
    const webhookSecret = source.STRIPE_WEBHOOK_SECRET?.trim();
    // Both or neither — a half-configured provider fails at charge time instead.
    if (secretKey && webhookSecret) {
      stripe = { secretKey, webhookSecret, webhookToleranceSeconds };
    } else if (secretKey || webhookSecret) {
      errors.push(
        "Configuración de Stripe incompleta: define STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET, o ninguna.",
      );
    }
  }

  const MAIL_FROM_PATTERN =
    /^[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+$|^[^<>]+<[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+>$/;

  const validateFrom = (from: string): void => {
    if (!MAIL_FROM_PATTERN.test(from)) {
      errors.push('MAIL_FROM debe ser un correo válido o "Nombre <correo@dominio>".');
    }
  };

  let mail: MailConfig | null = null;

  if (nodeEnv === "production") {
    // A paid order with no confirmation email is a business incident, not a
    // degraded mode — production must fail fast instead of silently stubbing.
    const apiKey = requireVar(source, "RESEND_API_KEY", errors);
    const from = requireVar(source, "MAIL_FROM", errors);
    if (apiKey && from) {
      validateFrom(from);
      mail = { apiKey, from };
    }
  } else {
    const apiKey = source.RESEND_API_KEY?.trim();
    const from = source.MAIL_FROM?.trim();
    if (apiKey && from) {
      validateFrom(from);
      mail = { apiKey, from };
    } else if (apiKey || from) {
      errors.push(
        "Configuración de correo incompleta: define RESEND_API_KEY y MAIL_FROM, o ninguna.",
      );
    }
  }

  // Telegram is the INTERNAL channel. Required in production (a deliberate step
  // past the baseline standard): the team alerts are how money/stock mismatches
  // reach a human, and a stub there would only ever log them. Outside production
  // it stays optional and the stub records messages as skipped.
  let telegram: TelegramConfig | null = null;
  if (nodeEnv === "production") {
    const botToken = requireVar(source, "TELEGRAM_BOT_TOKEN", errors);
    const chatId = requireVar(source, "TELEGRAM_CHAT_ID", errors);
    if (botToken && chatId) telegram = { botToken, chatId };
  } else {
    const botToken = source.TELEGRAM_BOT_TOKEN?.trim();
    const chatId = source.TELEGRAM_CHAT_ID?.trim();
    if (botToken && chatId) {
      telegram = { botToken, chatId };
    } else if (botToken || chatId) {
      errors.push(
        "Configuración de Telegram incompleta: define TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID, o ninguna.",
      );
    }
  }

  // Shipping is a central business flow (no rates = no checkout): required in production.
  const DEFAULT_CARRIERS = "estafeta,fedex,dhl,paquetexpress,redpack";
  let envia: EnviaConfig | null = null;
  const enviaToken =
    nodeEnv === "production"
      ? requireVar(source, "ENVIA_API_TOKEN", errors)
      : source.ENVIA_API_TOKEN?.trim();
  if (enviaToken) {
    const environmentRaw =
      source.ENVIA_ENVIRONMENT?.trim() || (nodeEnv === "production" ? "production" : "sandbox");
    if (environmentRaw !== "sandbox" && environmentRaw !== "production") {
      errors.push("ENVIA_ENVIRONMENT debe ser sandbox o production.");
    }
    const carriers = (source.ENVIA_CARRIERS?.trim() || DEFAULT_CARRIERS)
      .split(",")
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean);
    const allowed = Object.values(ShippingCarrier) as string[];
    const unknown = carriers.filter((c) => !allowed.includes(c));
    if (unknown.length > 0 || carriers.length === 0) {
      errors.push(
        `ENVIA_CARRIERS inválido (${unknown.join(", ") || "vacío"}). Permitidas: ${allowed.join(", ")}.`,
      );
    }
    const toleranceRaw = source.ENVIA_WEBHOOK_TOLERANCE_MS?.trim();
    const webhookToleranceMs = toleranceRaw ? Number(toleranceRaw) : 300_000;
    if (!Number.isInteger(webhookToleranceMs) || webhookToleranceMs <= 0) {
      errors.push("ENVIA_WEBHOOK_TOLERANCE_MS debe ser un entero positivo de milisegundos.");
    }
    envia = {
      apiToken: enviaToken,
      environment: environmentRaw === "production" ? "production" : "sandbox",
      carriers: carriers as ShippingCarrier[],
      webhookSecret: source.ENVIA_WEBHOOK_SECRET?.trim() || null,
      webhookToleranceMs,
    };
  }

  const stubShippingWebhookSecret = source.STUB_SHIPPING_WEBHOOK_SECRET?.trim() || null;
  if (stubShippingWebhookSecret && nodeEnv === "production") {
    errors.push("STUB_SHIPPING_WEBHOOK_SECRET no puede usarse en producción.");
  }

  if (errors.length > 0) {
    throw new Error(`Configuración de entorno inválida:\n  - ${errors.join("\n  - ")}`);
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
    trustProxyHops,
    cookieSecure,
    rateLimitEnabled,
    cloudinary,
    stripe,
    mail,
    telegram,
    envia,
    stubShippingWebhookSecret,
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

export type {
  Env,
  NodeEnv,
  CloudinaryConfig,
  StripeConfig,
  MailConfig,
  TelegramConfig,
  EnviaConfig,
};
export { loadEnv, parseBooleanFlag, env };
