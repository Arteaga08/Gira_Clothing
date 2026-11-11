import { describe, it, expect } from "vitest";
import { ApiError } from "@/lib/api/ApiError";
import { mapCheckoutFailure } from "@/lib/checkout/checkoutFailures";

const http = (status: number, message: string) => new ApiError(message, "http", status);

describe("mapCheckoutFailure", () => {
  it("401 manda a iniciar sesión", () => {
    expect(mapCheckoutFailure(http(401, "No has iniciado sesión.")).action).toBe("login");
  });

  it("cotización vencida o inválida → volver a cotizar", () => {
    expect(mapCheckoutFailure(http(409, "La cotización de envío venció. Vuelve a elegir tu envío.")).action).toBe("requote");
    expect(mapCheckoutFailure(http(409, "Tu carrito o tu código postal cambió. Vuelve a elegir tu envío.")).action).toBe("requote");
  });

  it("artículo no disponible o sin existencias → volver al carrito", () => {
    expect(mapCheckoutFailure(http(409, "Uno de los artículos ya no está disponible.")).action).toBe("cart");
    expect(mapCheckoutFailure(http(409, "Uno de los artículos ya no tiene existencias suficientes.")).action).toBe("cart");
  });

  it("mínimo de $10 con cupón → quitar el cupón; sin cupón → volver al carrito", () => {
    expect(
      mapCheckoutFailure(http(409, "Con este cupón tu pedido queda en menos de $10 y no se puede pagar con tarjeta.")).action,
    ).toBe("coupon");
    expect(mapCheckoutFailure(http(409, "Tu pedido queda en menos de $10 y no se puede pagar con tarjeta.")).action).toBe("cart");
  });

  it("pedido pendiente → reanudar", () => {
    expect(
      mapCheckoutFailure(http(409, "Ya tienes un pedido por pagar. Págalo o cancélalo para hacer otro.")).action,
    ).toBe("resume");
  });

  it("red, tiempo agotado, 429 y 5xx → reintentar con la misma clave", () => {
    expect(mapCheckoutFailure(new ApiError("x", "network")).action).toBe("retry");
    expect(mapCheckoutFailure(new ApiError("x", "timeout")).action).toBe("retry");
    expect(mapCheckoutFailure(http(429, "Demasiados intentos.")).action).toBe("retry");
    expect(mapCheckoutFailure(http(502, "Falló.")).action).toBe("retry");
    expect(mapCheckoutFailure(http(503, "Falló.")).action).toBe("retry");
  });

  it("un 4xx desconocido muestra el mensaje del API y no ofrece acción", () => {
    expect(mapCheckoutFailure(http(403, "Verifica tu correo antes de pagar."))).toEqual({
      action: "none",
      message: "Verifica tu correo antes de pagar.",
      definitive: true,
    });
  });

  it("un error que no es de la API da un mensaje genérico", () => {
    const f = mapCheckoutFailure(new Error("boom"));
    expect(f.action).toBe("retry");
    expect(f.message).not.toContain("boom");
  });

  it("marca como definitivos solo los rechazos 4xx (liberan la clave de idempotencia)", () => {
    expect(mapCheckoutFailure(http(409, "La cotización de envío venció. Vuelve a elegir tu envío.")).definitive).toBe(true);
    expect(mapCheckoutFailure(new ApiError("x", "network")).definitive).toBe(false);
    expect(mapCheckoutFailure(http(429, "x")).definitive).toBe(false);
    expect(mapCheckoutFailure(http(502, "x")).definitive).toBe(false);
  });
});
