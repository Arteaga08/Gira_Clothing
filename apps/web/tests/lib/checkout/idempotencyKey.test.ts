import { describe, it, expect, vi } from "vitest";
import {
  checkoutFingerprint,
  resolveCheckoutKey,
  forgetCheckoutKey,
  CHECKOUT_KEY_MAX_AGE_MS,
  type KeyStorage,
} from "@/lib/checkout/idempotencyKey";

const ADDRESS = {
  recipient: "Emilio Díaz",
  line1: "Calle Pino 214",
  district: "Roma Norte",
  city: "CDMX",
  state: "CMX",
  postalCode: "06700",
  country: "MX",
};
const base = {
  lines: [
    { variantId: "b", qty: 1 },
    { variantId: "a", qty: 2 },
  ],
  address: ADDRESS,
  phone: "5512345678",
  quote: { quoteId: "q1", rateId: "r1" },
  couponCode: "gira10",
};

const memoryStorage = (): KeyStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
};

describe("checkoutFingerprint", () => {
  it("no depende del orden de las líneas", () => {
    const reversed = { ...base, lines: [...base.lines].reverse() };
    expect(checkoutFingerprint(reversed)).toBe(checkoutFingerprint(base));
  });

  it("cambia con la cantidad, la dirección, el teléfono, la cotización o el cupón", () => {
    const fp = checkoutFingerprint(base);
    expect(checkoutFingerprint({ ...base, lines: [{ variantId: "a", qty: 3 }, base.lines[0]!] })).not.toBe(fp);
    expect(checkoutFingerprint({ ...base, address: { ...ADDRESS, line1: "Otra calle 1" } })).not.toBe(fp);
    expect(checkoutFingerprint({ ...base, phone: "5500000000" })).not.toBe(fp);
    expect(checkoutFingerprint({ ...base, quote: { quoteId: "q1", rateId: "r2" } })).not.toBe(fp);
    expect(checkoutFingerprint({ ...base, quote: { quoteId: "q2", rateId: "r1" } })).not.toBe(fp);
    expect(checkoutFingerprint({ ...base, couponCode: undefined })).not.toBe(fp);
  });

  it("trata el cupón sin importar mayúsculas ni espacios", () => {
    expect(checkoutFingerprint({ ...base, couponCode: "  GIRA10 " })).toBe(checkoutFingerprint(base));
  });
});

describe("resolveCheckoutKey", () => {
  it("genera una clave, la guarda y la reutiliza con la misma huella", () => {
    const storage = memoryStorage();
    const makeKey = vi.fn().mockReturnValueOnce("k1").mockReturnValueOnce("k2");
    expect(resolveCheckoutKey("fp", { storage, makeKey })).toBe("k1");
    expect(resolveCheckoutKey("fp", { storage, makeKey })).toBe("k1");
    expect(makeKey).toHaveBeenCalledTimes(1);
  });

  it("genera una nueva cuando la huella cambia", () => {
    const storage = memoryStorage();
    const makeKey = vi.fn().mockReturnValueOnce("k1").mockReturnValueOnce("k2");
    resolveCheckoutKey("fp-a", { storage, makeKey });
    expect(resolveCheckoutKey("fp-b", { storage, makeKey })).toBe("k2");
  });

  it("caduca a los 30 minutos (la reserva del pedido también)", () => {
    const storage = memoryStorage();
    const makeKey = vi.fn().mockReturnValueOnce("k1").mockReturnValueOnce("k2");
    resolveCheckoutKey("fp", { storage, makeKey, now: () => 1_000 });
    expect(resolveCheckoutKey("fp", { storage, makeKey, now: () => 1_000 + CHECKOUT_KEY_MAX_AGE_MS - 1 })).toBe("k1");
    expect(resolveCheckoutKey("fp", { storage, makeKey, now: () => 1_000 + CHECKOUT_KEY_MAX_AGE_MS })).toBe("k2");
  });

  it("ignora datos corruptos o con forma inesperada", () => {
    const storage = memoryStorage();
    const makeKey = vi.fn().mockReturnValue("fresh");
    for (const bad of ["{no es json", "null", '{"key":1}', '"texto"']) {
      storage.setItem("gira:checkout-key:v1", bad);
      expect(resolveCheckoutKey("fp", { storage, makeKey })).toBe("fresh");
    }
  });

  it("funciona sin storage o con un storage que lanza", () => {
    const makeKey = vi.fn().mockReturnValue("k");
    expect(resolveCheckoutKey("fp", { storage: null, makeKey })).toBe("k");
    const throwing: KeyStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(resolveCheckoutKey("fp", { storage: throwing, makeKey })).toBe("k");
    expect(() => forgetCheckoutKey(throwing)).not.toThrow();
  });
});

describe("forgetCheckoutKey", () => {
  it("borra la clave: la siguiente compra estrena una", () => {
    const storage = memoryStorage();
    const makeKey = vi.fn().mockReturnValueOnce("k1").mockReturnValueOnce("k2");
    resolveCheckoutKey("fp", { storage, makeKey });
    forgetCheckoutKey(storage);
    expect(resolveCheckoutKey("fp", { storage, makeKey })).toBe("k2");
  });
});
