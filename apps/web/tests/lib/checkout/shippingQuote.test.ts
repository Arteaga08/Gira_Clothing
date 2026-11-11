import { describe, it, expect } from "vitest";
import type { ShippingRate } from "@gira/shared";
import { ApiError } from "@/lib/api/ApiError";
import { TOO_MANY_ATTEMPTS_MESSAGE } from "@/lib/auth/authFailures";
import { cheapestRateId, msUntilExpiry, quoteFailure } from "@/lib/checkout/shippingQuote";

const rate = (rateId: string, amount: number, estimatedDays: number): ShippingRate =>
  ({ rateId, amount, estimatedDays, carrier: "estafeta", carrierName: "Estafeta", service: "s", serviceName: "Terrestre" }) as ShippingRate;

describe("cheapestRateId", () => {
  it("elige la tarifa más barata", () => {
    expect(cheapestRateId([rate("a", 16400, 1), rate("b", 8900, 4), rate("c", 13200, 3)])).toBe("b");
  });

  it("a igual precio, la más rápida", () => {
    expect(cheapestRateId([rate("a", 8900, 5), rate("b", 8900, 2)])).toBe("b");
  });

  it("sin tarifas, null", () => {
    expect(cheapestRateId([])).toBeNull();
  });
});

describe("quoteFailure", () => {
  it("un 422 es «sin cobertura» y conserva el mensaje del API", () => {
    const failure = quoteFailure(new ApiError("No hay paquetería disponible para ese código postal.", "http", 422));
    expect(failure).toEqual({ status: "no-coverage", message: "No hay paquetería disponible para ese código postal." });
  });

  it("cualquier otro fallo es un error con reintento", () => {
    expect(quoteFailure(new ApiError("Falló.", "http", 502)).status).toBe("error");
    expect(quoteFailure(new ApiError("x", "network")).status).toBe("error");
    expect(quoteFailure(new Error("boom"))).toEqual({
      status: "error",
      message: "No pudimos cotizar el envío. Inténtalo de nuevo.",
    });
  });

  it("un 429 (demasiadas consultas) pide esperar en lugar de reintentar a ciegas", () => {
    const failure = quoteFailure(new ApiError("Demasiadas solicitudes.", "http", 429));
    expect(failure.status).toBe("error");
    expect(failure.message).toBe(TOO_MANY_ATTEMPTS_MESSAGE);
  });

  it("un error de red no filtra el mensaje técnico", () => {
    expect(quoteFailure(new ApiError("fetch failed: ECONNRESET", "network")).message).not.toContain("ECONNRESET");
  });
});

describe("msUntilExpiry", () => {
  it("cuenta lo que falta hasta el vencimiento", () => {
    expect(msUntilExpiry("2026-10-28T12:00:10.000Z", Date.parse("2026-10-28T12:00:00.000Z"))).toBe(10_000);
  });

  it("una cotización ya vencida o con fecha inválida da 0", () => {
    expect(msUntilExpiry("2026-10-28T11:00:00.000Z", Date.parse("2026-10-28T12:00:00.000Z"))).toBe(0);
    expect(msUntilExpiry("no-es-fecha", 0)).toBe(0);
  });
});
