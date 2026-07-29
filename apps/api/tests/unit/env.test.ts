import { describe, it, expect } from "vitest";
import { loadEnv } from "../../src/config/env.js";

// A valid baseline that individual tests mutate to isolate one failure at a time.
const validSource = (): NodeJS.ProcessEnv => ({
  NODE_ENV: "development",
  PORT: "4000",
  MONGODB_URI: "mongodb://127.0.0.1:27017/gira",
  JWT_SECRET: "x".repeat(48),
  JWT_EXPIRES_IN: "7d",
  ENCRYPTION_KEY: "y".repeat(48),
  CLIENT_URL: "http://localhost:3000",
  COOKIE_NAME: "gira_session",
  LOG_LEVEL: "info",
});

describe("loadEnv", () => {
  it("acepta un entorno válido y devuelve un objeto congelado", () => {
    const env = loadEnv(validSource());
    expect(env.nodeEnv).toBe("development");
    expect(Object.isFrozen(env)).toBe(true);
  });

  it("aborta si falta MONGODB_URI (el mensaje nombra la variable)", () => {
    const source = validSource();
    delete source.MONGODB_URI;
    expect(() => loadEnv(source)).toThrow(/MONGODB_URI/);
  });

  it("aborta si JWT_SECRET tiene menos de 48 caracteres", () => {
    const source = validSource();
    source.JWT_SECRET = "short";
    expect(() => loadEnv(source)).toThrow(/JWT_SECRET/);
  });

  it("aborta si ENCRYPTION_KEY tiene menos de 48 caracteres", () => {
    const source = validSource();
    source.ENCRYPTION_KEY = "short";
    expect(() => loadEnv(source)).toThrow(/ENCRYPTION_KEY/);
  });

  it("aborta si NODE_ENV no es production|development|test", () => {
    const source = validSource();
    source.NODE_ENV = "staging";
    expect(() => loadEnv(source)).toThrow(/NODE_ENV/);
  });

  it("agrupa todos los errores en un solo mensaje", () => {
    const source = validSource();
    delete source.MONGODB_URI;
    delete source.JWT_SECRET;
    expect(() => loadEnv(source)).toThrow(/MONGODB_URI[\s\S]*JWT_SECRET|JWT_SECRET[\s\S]*MONGODB_URI/);
  });

  it("en producción exige CLIENT_URL con https", () => {
    const source = validSource();
    source.NODE_ENV = "production";
    source.CLIENT_URL = "http://insecure.com";
    expect(() => loadEnv(source)).toThrow(/CLIENT_URL/);
  });

  it("en producción exige las tres variables de Cloudinary", () => {
    const source = validSource();
    source.NODE_ENV = "production";
    source.CLIENT_URL = "https://gira.mx";
    expect(() => loadEnv(source)).toThrow(/CLOUDINARY_CLOUD_NAME/);
  });

  it("fuera de producción, una sola variable de Cloudinary configurada aborta (todo o nada)", () => {
    const source = validSource();
    source.CLOUDINARY_CLOUD_NAME = "gira-cloud";
    expect(() => loadEnv(source)).toThrow(/Cloudinary/);
  });

  it("fuera de producción, sin variables de Cloudinary usa el adapter stub (cloudinary: null)", () => {
    const env = loadEnv(validSource());
    expect(env.cloudinary).toBeNull();
  });

  it("con las tres variables de Cloudinary completas, arma la configuración", () => {
    const source = validSource();
    source.CLOUDINARY_CLOUD_NAME = "gira-cloud";
    source.CLOUDINARY_API_KEY = "key123";
    source.CLOUDINARY_API_SECRET = "secret123";
    const env = loadEnv(source);
    expect(env.cloudinary).toEqual({
      cloudName: "gira-cloud",
      apiKey: "key123",
      apiSecret: "secret123",
      folder: "gira",
    });
  });

  it("en producción exige las dos variables de Stripe", () => {
    const source = validSource();
    source.NODE_ENV = "production";
    source.CLIENT_URL = "https://gira.mx";
    source.CLOUDINARY_CLOUD_NAME = "gira-cloud";
    source.CLOUDINARY_API_KEY = "key123";
    source.CLOUDINARY_API_SECRET = "secret123";
    expect(() => loadEnv(source)).toThrow(/STRIPE_SECRET_KEY/);
  });

  it("fuera de producción, sin variables de Stripe usa el adapter stub (stripe: null)", () => {
    const env = loadEnv(validSource());
    expect(env.stripe).toBeNull();
  });

  it("fuera de producción, una sola variable de Stripe configurada aborta (todo o nada)", () => {
    const source = validSource();
    source.STRIPE_SECRET_KEY = "sk_test_x";
    expect(() => loadEnv(source)).toThrow(/Configuración de Stripe incompleta/);
  });

  it("con las dos variables de Stripe completas, arma la configuración con la tolerancia por default", () => {
    const source = validSource();
    source.STRIPE_SECRET_KEY = "sk_test_x";
    source.STRIPE_WEBHOOK_SECRET = "whsec_x";
    const env = loadEnv(source);
    expect(env.stripe).toEqual({
      secretKey: "sk_test_x",
      webhookSecret: "whsec_x",
      webhookToleranceSeconds: 300,
    });
  });

  it("respeta STRIPE_WEBHOOK_TOLERANCE_SECONDS cuando se configura", () => {
    const source = validSource();
    source.STRIPE_SECRET_KEY = "sk_test_x";
    source.STRIPE_WEBHOOK_SECRET = "whsec_x";
    source.STRIPE_WEBHOOK_TOLERANCE_SECONDS = "120";
    const env = loadEnv(source);
    expect(env.stripe?.webhookToleranceSeconds).toBe(120);
  });

  it("aborta si STRIPE_WEBHOOK_TOLERANCE_SECONDS no es un entero positivo", () => {
    const source = validSource();
    source.STRIPE_WEBHOOK_TOLERANCE_SECONDS = "-5";
    expect(() => loadEnv(source)).toThrow(/STRIPE_WEBHOOK_TOLERANCE_SECONDS/);
  });

  describe("loadEnv · Resend", () => {
    it("en producción exige RESEND_API_KEY y MAIL_FROM", () => {
      const source = validSource();
      source.NODE_ENV = "production";
      source.CLIENT_URL = "https://gira.mx";
      source.CLOUDINARY_CLOUD_NAME = "gira-cloud";
      source.CLOUDINARY_API_KEY = "key123";
      source.CLOUDINARY_API_SECRET = "secret123";
      source.STRIPE_SECRET_KEY = "sk_test_x";
      source.STRIPE_WEBHOOK_SECRET = "whsec_x";
      expect(() => loadEnv(source)).toThrow(/RESEND_API_KEY/);
    });

    it("fuera de producción, sin variables de Resend usa el mailer stub (mail: null)", () => {
      const env = loadEnv(validSource());
      expect(env.mail).toBeNull();
    });

    it("fuera de producción, una sola variable de Resend configurada aborta (todo o nada)", () => {
      const source = validSource();
      source.RESEND_API_KEY = "re_test_x";
      expect(() => loadEnv(source)).toThrow(/Configuración de correo incompleta/);
    });

    it("rechaza un MAIL_FROM sin formato de correo", () => {
      const source = validSource();
      source.RESEND_API_KEY = "re_test_x";
      source.MAIL_FROM = "no-es-correo";
      expect(() => loadEnv(source)).toThrow(/MAIL_FROM/);
    });

    it("acepta un MAIL_FROM en formato \"Nombre <correo@dominio>\"", () => {
      const source = validSource();
      source.RESEND_API_KEY = "re_test_x";
      source.MAIL_FROM = "Gira Clothing <hola@giraclothing.mx>";
      const env = loadEnv(source);
      expect(env.mail).toEqual({ apiKey: "re_test_x", from: "Gira Clothing <hola@giraclothing.mx>" });
    });

    it("acepta un MAIL_FROM en formato correo simple", () => {
      const source = validSource();
      source.RESEND_API_KEY = "re_test_x";
      source.MAIL_FROM = "hola@giraclothing.mx";
      const env = loadEnv(source);
      expect(env.mail).toEqual({ apiKey: "re_test_x", from: "hola@giraclothing.mx" });
    });
  });

  describe("loadEnv · Telegram", () => {
    it("deja telegram en null cuando no hay credenciales, incluso en producción", () => {
      const source = validSource();
      source.NODE_ENV = "production";
      source.CLIENT_URL = "https://gira.mx";
      source.CLOUDINARY_CLOUD_NAME = "gira-cloud";
      source.CLOUDINARY_API_KEY = "key123";
      source.CLOUDINARY_API_SECRET = "secret123";
      source.STRIPE_SECRET_KEY = "sk_test_x";
      source.STRIPE_WEBHOOK_SECRET = "whsec_x";
      source.RESEND_API_KEY = "re_test_x";
      source.MAIL_FROM = "hola@giraclothing.mx";
      const env = loadEnv(source);
      expect(env.telegram).toBeNull();
    });

    it("rechaza una configuración a medias", () => {
      const source = validSource();
      source.TELEGRAM_BOT_TOKEN = "123:abc";
      expect(() => loadEnv(source)).toThrow(/Configuración de Telegram incompleta/);
    });

    it("con las dos variables completas, arma la configuración", () => {
      const source = validSource();
      source.TELEGRAM_BOT_TOKEN = "123:abc";
      source.TELEGRAM_CHAT_ID = "-100";
      const env = loadEnv(source);
      expect(env.telegram).toEqual({ botToken: "123:abc", chatId: "-100" });
    });
  });
});
