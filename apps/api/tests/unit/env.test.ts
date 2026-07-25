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
});
