import { describe, it, expect, vi } from "vitest";
import { ShippingCarrier } from "@gira/shared";
import { createEnviaShippingProvider } from "../../src/adapters/shipping/enviaShippingProvider.js";
import { ShippingProviderError } from "../../src/adapters/shipping/types.js";

const CONFIG = {
  apiToken: "tok_test",
  environment: "sandbox" as const,
  carriers: [ShippingCarrier.ESTAFETA, ShippingCarrier.FEDEX],
  webhookSecret: null,
  webhookToleranceMs: 300_000,
};

const origin = {
  name: "Gira Clothing", phone: "5512345678", line1: "Av. Reforma 100",
  district: "Juárez", city: "Ciudad de México", state: "CX", postalCode: "06600",
};
const destination = {
  name: "Ana Pérez", phone: "5598765432", line1: "Calle Falsa 123",
  district: "Centro", city: "Monterrey", state: "NL", postalCode: "64000",
};
const parcel = { weightGrams: 850, lengthCm: 30, widthCm: 25, heightCm: 8 };
const rateInput = { origin, destination, parcel, declaredValueMxn: 129_900 };

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const rateEntry = (carrier: string, service: string, totalPrice: number, days = 3) => ({
  carrier, service, serviceDescription: `Servicio ${service}`, totalPrice, currency: "MXN",
  deliveryDate: { dateDifference: days },
});

describe("enviaShippingProvider · getRates", () => {
  it("llama una vez por paquetería, en el host de sandbox y con Bearer", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ meta: "rate", data: [rateEntry("estafeta", "ground", 135.5, 4)] })));
    const provider = createEnviaShippingProvider(CONFIG, fetchMock as unknown as typeof fetch);
    await provider.getRates(rateInput, {});
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api-test.envia.com/ship/rate/");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok_test");
    const body = JSON.parse(init.body as string);
    expect(body.packages[0].weight).toBeCloseTo(0.85);
    expect(body.packages[0].weightUnit).toBe("KG");
    expect(body.packages[0].declaredValue).toBe(1299);
    expect(body.destination.state).toBe("NL");
    expect(body.shipment.carrier).toBe("estafeta");
  });

  it("usa el host de producción cuando el ambiente es production", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ meta: "rate", data: [] })));
    const provider = createEnviaShippingProvider({ ...CONFIG, environment: "production" }, fetchMock as unknown as typeof fetch);
    await provider.getRates(rateInput, {}).catch(() => undefined);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("https://api.envia.com/ship/rate/");
  });

  it("convierte pesos a centavos y mapea paquetería, servicio y días", async () => {
    const fetchMock = vi.fn((_u: string, init: RequestInit) => {
      const carrier = JSON.parse(init.body as string).shipment.carrier as string;
      return Promise.resolve(jsonResponse({ meta: "rate", data: [rateEntry(carrier, "ground", 135.5, 4)] }));
    });
    const provider = createEnviaShippingProvider(CONFIG, fetchMock as unknown as typeof fetch);
    const rates = await provider.getRates(rateInput, {});
    expect(rates).toHaveLength(2);
    expect(rates[0]).toEqual({
      carrier: ShippingCarrier.ESTAFETA, service: "ground", serviceName: "Servicio ground",
      costMxn: 13_550, estimatedDays: 4,
    });
  });

  it("ignora una paquetería que falla y devuelve las demás", async () => {
    const fetchMock = vi.fn((_u: string, init: RequestInit) => {
      const carrier = JSON.parse(init.body as string).shipment.carrier as string;
      return Promise.resolve(
        carrier === "estafeta"
          ? jsonResponse({ meta: "error", error: { code: 400, message: "sin cobertura" } })
          : jsonResponse({ meta: "rate", data: [rateEntry(carrier, "express", 150, 2)] }),
      );
    });
    const provider = createEnviaShippingProvider(CONFIG, fetchMock as unknown as typeof fetch);
    const rates = await provider.getRates(rateInput, {});
    expect(rates.map((r) => r.carrier)).toEqual([ShippingCarrier.FEDEX]);
  });

  it("descarta paqueterías fuera de la lista cerrada", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ meta: "rate", data: [rateEntry("paqueteria_rara", "x", 90)] })));
    const provider = createEnviaShippingProvider(CONFIG, fetchMock as unknown as typeof fetch);
    expect(await provider.getRates(rateInput, {})).toEqual([]);
  });

  it("si todas fallan por la dirección lanza rejected; si todas caen, unavailable", async () => {
    const bad = vi.fn(() => Promise.resolve(jsonResponse({ meta: "error", error: { code: 422, message: "CP inválido" } })));
    await expect(createEnviaShippingProvider(CONFIG, bad as unknown as typeof fetch).getRates(rateInput, {}))
      .rejects.toMatchObject({ kind: "rejected" });
    const down = vi.fn(() => Promise.reject(new TypeError("fetch failed")));
    await expect(createEnviaShippingProvider(CONFIG, down as unknown as typeof fetch).getRates(rateInput, {}))
      .rejects.toMatchObject({ kind: "unavailable" });
  });
});

describe("enviaShippingProvider · createLabel", () => {
  const labelInput = { ...rateInput, orderRef: "GC-ABCD1234", carrier: ShippingCarrier.FEDEX, service: "express" };
  const okLabel = {
    meta: "generate",
    data: [{ carrier: "fedex", service: "express", shipmentId: 98765, trackingNumber: "794644790138",
      trackUrl: "https://envia.com/track/794644790138", label: "https://files.envia.com/l.pdf", totalPrice: 150 }],
  };

  it("compra la guía y devuelve nuestro vocabulario", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(okLabel)));
    const provider = createEnviaShippingProvider(CONFIG, fetchMock as unknown as typeof fetch);
    const result = await provider.createLabel(labelInput, {});
    expect(result).toEqual({
      providerShipmentId: "98765", trackingNumber: "794644790138", carrier: ShippingCarrier.FEDEX,
      labelUrl: "https://files.envia.com/l.pdf", trackUrl: "https://envia.com/track/794644790138", costMxn: 15_000,
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api-test.envia.com/ship/generate/");
    const body = JSON.parse(init.body as string);
    expect(body.shipment.service).toBe("express");
    expect(body.settings.printFormat).toBe("PDF");
  });

  it("402 (saldo insuficiente) y errores de negocio son rejected", async () => {
    const f402 = vi.fn(() => Promise.resolve(jsonResponse({ meta: "error", error: { code: 402, message: "saldo" } }, 402)));
    await expect(createEnviaShippingProvider(CONFIG, f402 as unknown as typeof fetch).createLabel(labelInput, {}))
      .rejects.toMatchObject({ kind: "rejected", message: expect.stringContaining("Saldo") });
    const f200 = vi.fn(() => Promise.resolve(jsonResponse({ meta: "error", error: { code: 400, message: "dirección" } })));
    await expect(createEnviaShippingProvider(CONFIG, f200 as unknown as typeof fetch).createLabel(labelInput, {}))
      .rejects.toMatchObject({ kind: "rejected" });
  });

  it("un fallo de red, timeout o 5xx es unknown_outcome (nunca se reintenta solo)", async () => {
    const net = vi.fn(() => Promise.reject(new TypeError("fetch failed")));
    await expect(createEnviaShippingProvider(CONFIG, net as unknown as typeof fetch).createLabel(labelInput, {}))
      .rejects.toMatchObject({ kind: "unknown_outcome" });
    const f503 = vi.fn(() => Promise.resolve(new Response("oops", { status: 503 })));
    await expect(createEnviaShippingProvider(CONFIG, f503 as unknown as typeof fetch).createLabel(labelInput, {}))
      .rejects.toMatchObject({ kind: "unknown_outcome" });
  });

  it("429 es unavailable (no se procesó) y 401 con texto plano es rejected", async () => {
    const f429 = vi.fn(() => Promise.resolve(new Response("slow down", { status: 429 })));
    await expect(createEnviaShippingProvider(CONFIG, f429 as unknown as typeof fetch).createLabel(labelInput, {}))
      .rejects.toMatchObject({ kind: "unavailable" });
    const f401 = vi.fn(() => Promise.resolve(new Response("Unauthorized", { status: 401 })));
    await expect(createEnviaShippingProvider(CONFIG, f401 as unknown as typeof fetch).createLabel(labelInput, {}))
      .rejects.toMatchObject({ kind: "rejected" });
  });

  it("una respuesta 200 sin guía es unknown_outcome", async () => {
    const empty = vi.fn(() => Promise.resolve(jsonResponse({ meta: "generate", data: [] })));
    await expect(createEnviaShippingProvider(CONFIG, empty as unknown as typeof fetch).createLabel(labelInput, {}))
      .rejects.toBeInstanceOf(ShippingProviderError);
  });
});

describe("enviaShippingProvider · cancelLabel", () => {
  it("cancela con paquetería y guía", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ meta: "cancel", data: { balanceReturned: true } })));
    const provider = createEnviaShippingProvider(CONFIG, fetchMock as unknown as typeof fetch);
    await provider.cancelLabel({ carrier: ShippingCarrier.FEDEX, trackingNumber: "794644790138" }, {});
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api-test.envia.com/ship/cancel/");
    expect(JSON.parse(init.body as string)).toEqual({ carrier: "fedex", trackingNumber: "794644790138" });
  });

  it("una guía ya escaneada es rejected; una caída es unavailable", async () => {
    const no = vi.fn(() => Promise.resolve(jsonResponse({ meta: "error", error: { code: 400, message: "ya recolectado" } })));
    await expect(createEnviaShippingProvider(CONFIG, no as unknown as typeof fetch).cancelLabel({ carrier: ShippingCarrier.DHL, trackingNumber: "1" }, {}))
      .rejects.toMatchObject({ kind: "rejected" });
    const down = vi.fn(() => Promise.reject(new TypeError("fetch failed")));
    await expect(createEnviaShippingProvider(CONFIG, down as unknown as typeof fetch).cancelLabel({ carrier: ShippingCarrier.DHL, trackingNumber: "1" }, {}))
      .rejects.toMatchObject({ kind: "unavailable" });
  });
});
