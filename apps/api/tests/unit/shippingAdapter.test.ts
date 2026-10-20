import { describe, it, expect } from "vitest";
import { ShippingCarrier } from "@gira/shared";
import { createStubShippingProvider } from "../../src/adapters/shipping/stubShippingProvider.js";
import { ShippingProviderError } from "../../src/adapters/shipping/types.js";
import { getShippingProvider } from "../../src/adapters/shipping/index.js";

const origin = {
  name: "Gira Clothing",
  phone: "5512345678",
  line1: "Av. Reforma 100",
  district: "Juárez",
  city: "Ciudad de México",
  state: "CX",
  postalCode: "06600",
};
const destination = {
  name: "Ana Pérez",
  phone: "5598765432",
  line1: "Calle Falsa 123",
  district: "Centro",
  city: "Monterrey",
  state: "NL",
  postalCode: "64000",
};
const parcel = { weightGrams: 800, lengthCm: 30, widthCm: 25, heightCm: 8 };

describe("stubShippingProvider", () => {
  const stub = createStubShippingProvider();

  it("se identifica como stub", () => {
    expect(stub.name).toBe("stub");
  });

  it("cotiza tarifas deterministas en centavos MXN, solo con paqueterías de la lista", async () => {
    const rates = await stub.getRates({ origin, destination, parcel, declaredValueMxn: 100_000 }, {});
    expect(rates.length).toBeGreaterThanOrEqual(2);
    for (const r of rates) {
      expect(Object.values(ShippingCarrier)).toContain(r.carrier);
      expect(Number.isInteger(r.costMxn)).toBe(true);
      expect(r.costMxn).toBeGreaterThan(0);
    }
    expect(await stub.getRates({ origin, destination, parcel, declaredValueMxn: 100_000 }, {})).toEqual(rates);
  });

  it("compra una guía con número de rastreo determinista por orden", async () => {
    const input = {
      orderRef: "GC-AAAA1111",
      origin,
      destination,
      parcel,
      carrier: ShippingCarrier.ESTAFETA,
      service: "ground",
      declaredValueMxn: 100_000,
    };
    const a = await stub.createLabel(input, {});
    const b = await stub.createLabel(input, {});
    expect(a.trackingNumber).toMatch(/^STUB/);
    expect(a.trackingNumber).toBe(b.trackingNumber);
    expect(a.labelUrl).toMatch(/^https:\/\//);
    expect(a.carrier).toBe(ShippingCarrier.ESTAFETA);
  });

  it("cancela una guía sin error", async () => {
    await expect(
      stub.cancelLabel({ carrier: ShippingCarrier.ESTAFETA, trackingNumber: "STUB123" }, {}),
    ).resolves.toBeUndefined();
  });
});

describe("ShippingProviderError", () => {
  it("lleva su tipo y un mensaje en español", () => {
    const err = new ShippingProviderError("rejected", "Dirección inválida");
    expect(err.kind).toBe("rejected");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("getShippingProvider", () => {
  it("sin ENVIA_API_TOKEN (tests) entrega el stub", () => {
    expect(getShippingProvider().name).toBe("stub");
  });
});
