import { OrderStatus } from "@gira/shared";
import { describe, expect, it } from "vitest";
import { ORDER_TABS, canEditShippingAddress, isManualTransitionAllowed } from "@/lib/orders/status";

describe("ORDER_TABS", () => {
  it("define las pestañas en el orden del flujo y termina con Todos", () => {
    expect(ORDER_TABS.map((tab) => tab.id)).toEqual([
      "pending_payment",
      "paid",
      "processing",
      "shipped",
      "delivered",
      "all",
    ]);
  });

  it("usa los textos pedidos por la operación", () => {
    expect(ORDER_TABS.map((tab) => tab.label)).toEqual([
      "Pago pendiente",
      "Pagado",
      "En proceso",
      "Enviado",
      "Recibido",
      "Todos",
    ]);
  });
});

describe("isManualTransitionAllowed", () => {
  it("permite paid → processing y pending_payment → cancelled", () => {
    expect(isManualTransitionAllowed(OrderStatus.PAID, OrderStatus.PROCESSING)).toBe(true);
    expect(isManualTransitionAllowed(OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED)).toBe(true);
  });

  it("nunca ofrece shipped ni delivered", () => {
    expect(isManualTransitionAllowed(OrderStatus.PROCESSING, OrderStatus.SHIPPED)).toBe(false);
    expect(isManualTransitionAllowed(OrderStatus.SHIPPED, OrderStatus.DELIVERED)).toBe(false);
  });
});

describe("canEditShippingAddress", () => {
  it.each([OrderStatus.PENDING_PAYMENT, OrderStatus.PAID, OrderStatus.PROCESSING])("%s sí", (status) => {
    expect(canEditShippingAddress(status)).toBe(true);
  });

  it.each([
    OrderStatus.SHIPPED,
    OrderStatus.DELIVERED,
    OrderStatus.CANCELLED,
    OrderStatus.EXPIRED,
    OrderStatus.REFUNDED,
  ])("%s no", (status) => {
    expect(canEditShippingAddress(status)).toBe(false);
  });
});
