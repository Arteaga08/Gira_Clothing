import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret } from "../../src/utils/crypto.js";

const SAMPLE = "JBSWY3DPEHPK3PXP"; // a base32 TOTP secret shape

describe("crypto (AES-256-GCM)", () => {
  it("round-trip: descifra exactamente lo que cifró", () => {
    expect(decryptSecret(encryptSecret(SAMPLE))).toBe(SAMPLE);
  });

  it("produce un ciphertext distinto cada vez (IV aleatorio)", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("tiene formato ivHex:authTagHex:cipherHex con IV de 12 bytes", () => {
    const parts = encryptSecret("x").split(":");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toHaveLength(24); // 12 bytes IV -> 24 hex chars
    expect(parts[1]).toHaveLength(32); // 16 bytes auth tag -> 32 hex chars
  });

  it("lanza si el authTag fue manipulado", () => {
    const [iv, , cipher] = encryptSecret(SAMPLE).split(":");
    const forgedTag = "0".repeat(32);
    expect(() => decryptSecret(`${iv}:${forgedTag}:${cipher}`)).toThrow();
  });

  it("lanza si el payload no tiene las tres partes", () => {
    expect(() => decryptSecret("nope")).toThrow(/formato/i);
  });
});
