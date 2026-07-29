import { describe, it, expect } from "vitest";
import { OrderStatus } from "@gira/shared";
import {
  canTransition,
  assertTransition,
  assertAdminTransition,
} from "../../src/utils/orderTransitions.js";

describe("canTransition", () => {
  it("permite el camino feliz completo", () => {
    const path = [
      OrderStatus.PENDING_PAYMENT,
      OrderStatus.PAID,
      OrderStatus.PROCESSING,
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
    ];
    for (let i = 0; i < path.length - 1; i += 1) {
      expect(canTransition(path[i]!, path[i + 1]!)).toBe(true);
    }
  });
  it("prohíbe saltarse el pago", () => {
    expect(canTransition(OrderStatus.PENDING_PAYMENT, OrderStatus.SHIPPED)).toBe(false);
  });
  it("prohíbe retroceder", () => {
    expect(canTransition(OrderStatus.SHIPPED, OrderStatus.PROCESSING)).toBe(false);
  });
  it("prohíbe salir de un estado terminal", () => {
    for (const terminal of [OrderStatus.CANCELLED, OrderStatus.EXPIRED, OrderStatus.REFUNDED]) {
      for (const to of Object.values(OrderStatus)) {
        expect(canTransition(terminal, to)).toBe(false);
      }
    }
  });
  it("permite volver a paid cuando se gana una disputa", () => {
    expect(canTransition(OrderStatus.DISPUTED, OrderStatus.PAID)).toBe(true);
  });
  it("permite reembolsar una orden enviada sin pasar por delivered", () => {
    // A lost-in-transit shipment must be refundable without first marking it
    // delivered — DELIVERED is not a prerequisite for REFUNDED.
    expect(canTransition(OrderStatus.SHIPPED, OrderStatus.REFUNDED)).toBe(true);
  });
  it("prohíbe una transición hacia el mismo estado", () => {
    expect(canTransition(OrderStatus.PAID, OrderStatus.PAID)).toBe(false);
  });
});

describe("assertTransition", () => {
  it("lanza 409 con mensaje en español en una transición inválida", () => {
    expect(() => assertTransition(OrderStatus.PENDING_PAYMENT, OrderStatus.SHIPPED)).toThrow(
      expect.objectContaining({ statusCode: 409 }),
    );
  });
  it("no lanza en una transición válida", () => {
    expect(() => assertTransition(OrderStatus.PAID, OrderStatus.PROCESSING)).not.toThrow();
  });
});

describe("assertAdminTransition", () => {
  it("permite a la admin avanzar la operación", () => {
    expect(() => assertAdminTransition(OrderStatus.PAID, OrderStatus.PROCESSING)).not.toThrow();
    expect(() => assertAdminTransition(OrderStatus.PROCESSING, OrderStatus.SHIPPED)).not.toThrow();
    expect(() => assertAdminTransition(OrderStatus.SHIPPED, OrderStatus.DELIVERED)).not.toThrow();
    expect(() =>
      assertAdminTransition(OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED),
    ).not.toThrow();
  });
  it("prohíbe a la admin marcar una orden como pagada a mano", () => {
    expect(() => assertAdminTransition(OrderStatus.PENDING_PAYMENT, OrderStatus.PAID)).toThrow(
      expect.objectContaining({ statusCode: 403 }),
    );
  });
  it("prohíbe a la admin marcar reembolso o disputa a mano", () => {
    for (const to of [OrderStatus.REFUNDED, OrderStatus.DISPUTED]) {
      expect(() => assertAdminTransition(OrderStatus.PAID, to)).toThrow(
        expect.objectContaining({ statusCode: 403 }),
      );
    }
  });
});
