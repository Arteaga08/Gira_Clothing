import { describe, it, expect } from "vitest";
import { generatePublicId } from "../../src/utils/publicId.js";

describe("generatePublicId", () => {
  it("devuelve una cadena base64url segura para URL", () => {
    expect(generatePublicId()).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it("tiene al menos 43 caracteres (32 bytes de entropía)", () => {
    expect(generatePublicId().length).toBeGreaterThanOrEqual(43);
  });
  it("no repite en 10 000 generaciones", () => {
    const seen = new Set(Array.from({ length: 10_000 }, () => generatePublicId()));
    expect(seen.size).toBe(10_000);
  });
});
