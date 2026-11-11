import { describe, it, expect } from "vitest";
import { parsePublishableKey } from "@/lib/checkout/stripeConfig";

describe("parsePublishableKey", () => {
  it("acepta una llave publicable", () => {
    expect(parsePublishableKey("pk_test_abc123")).toBe("pk_test_abc123");
    expect(parsePublishableKey("  pk_live_abc  ")).toBe("pk_live_abc");
  });

  it("rechaza una llave secreta o restringida: jamás debe llegar al navegador", () => {
    expect(parsePublishableKey("sk_test_abc")).toBeNull();
    expect(parsePublishableKey("rk_live_abc")).toBeNull();
  });

  it("sin llave o vacía, null (el pago dice «Pagos no disponibles»)", () => {
    expect(parsePublishableKey(undefined)).toBeNull();
    expect(parsePublishableKey("")).toBeNull();
    expect(parsePublishableKey("   ")).toBeNull();
  });
});
