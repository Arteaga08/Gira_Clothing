import { describe, it, expect } from "vitest";
import { buildCookieOptions, buildClearCookieOptions } from "../../src/utils/token.js";
import { env } from "../../src/config/env.js";

describe("opciones de cookie", () => {
  it("el flag secure sale de env.cookieSecure, no de NODE_ENV", () => {
    expect(buildCookieOptions().secure).toBe(env.cookieSecure);
    expect(buildClearCookieOptions().secure).toBe(env.cookieSecure);
  });
});
