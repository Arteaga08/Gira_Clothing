import { describe, it, expect } from "vitest";
import { OrderStatus, ORDER_STATUS_LABELS } from "@gira/shared";
import {
  canTransition,
  assertTransition,
  assertAdminTransition,
  LABELS,
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

/**
 * The expected table is written out by hand on purpose: deriving it from
 * TRANSITIONS would make the test pass for any table, including a wrong one.
 * Every (from, to) pair is checked, so a new status or a new edge cannot slip
 * in without someone editing this table.
 */
const S = OrderStatus;
const EXPECTED: Record<OrderStatus, readonly OrderStatus[]> = {
  [S.PENDING_PAYMENT]: [S.PAID, S.CANCELLED, S.EXPIRED],
  [S.PAID]: [S.PROCESSING, S.REFUNDED, S.DISPUTED],
  [S.PROCESSING]: [S.SHIPPED, S.REFUNDED, S.DISPUTED],
  [S.SHIPPED]: [S.DELIVERED, S.REFUNDED, S.DISPUTED],
  [S.DELIVERED]: [S.REFUNDED, S.DISPUTED],
  [S.DISPUTED]: [S.PAID, S.REFUNDED],
  [S.CANCELLED]: [],
  [S.EXPIRED]: [],
  [S.REFUNDED]: [],
};
const ADMIN_EXPECTED = new Set([
  `${S.PAID}->${S.PROCESSING}`,
  `${S.PROCESSING}->${S.SHIPPED}`,
  `${S.SHIPPED}->${S.DELIVERED}`,
  `${S.PENDING_PAYMENT}->${S.CANCELLED}`,
]);
const ALL = Object.values(OrderStatus);

describe("matriz completa estado×estado", () => {
  it("la tabla esperada cubre todos los estados", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...ALL].sort());
  });

  for (const from of ALL) {
    for (const to of ALL) {
      const allowed = EXPECTED[from].includes(to);
      it(`${from} -> ${to}: canTransition = ${allowed}`, () => {
        expect(canTransition(from, to)).toBe(allowed);
      });
      it(`${from} -> ${to}: assertTransition ${allowed ? "no lanza" : "lanza 409"}`, () => {
        if (allowed) expect(() => assertTransition(from, to)).not.toThrow();
        else expect(() => assertTransition(from, to)).toThrow(expect.objectContaining({ statusCode: 409 }));
      });
      it(`${from} -> ${to}: assertAdminTransition`, () => {
        if (!allowed) {
          expect(() => assertAdminTransition(from, to)).toThrow(
            expect.objectContaining({ statusCode: 409 }),
          );
        } else if (ADMIN_EXPECTED.has(`${from}->${to}`)) {
          expect(() => assertAdminTransition(from, to)).not.toThrow();
        } else {
          expect(() => assertAdminTransition(from, to)).toThrow(
            expect.objectContaining({ statusCode: 403 }),
          );
        }
      });
    }
  }
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
  it("LABELS de @gira/shared coincide con el mapa re-exportado", () => {
    expect(LABELS).toBe(ORDER_STATUS_LABELS);
  });
});
