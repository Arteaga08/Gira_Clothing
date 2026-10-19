import { describe, it, expect } from "vitest";
import { generateOneTimeToken, hashOneTimeToken } from "../../src/utils/oneTimeToken.js";

describe("tokens de un solo uso (verificación y reset)", () => {
  it("genera 64 caracteres hex y nunca repite", () => {
    const a = generateOneTimeToken();
    const b = generateOneTimeToken();
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(a).not.toBe(b);
  });

  it("el hash es determinista, distinto del token y también de 64 hex (sha256)", () => {
    const token = generateOneTimeToken();
    const hash = hashOneTimeToken(token);
    expect(hash).toBe(hashOneTimeToken(token));
    expect(hash).not.toBe(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
