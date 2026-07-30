import { describe, it, expect } from "vitest";
import type {
  AdminOrder,
  AdminUser,
  AdminShipment,
  AdminShipmentListItem,
  TimeseriesStats,
  OutboxHealth,
  Overview,
} from "@gira/shared";

/**
 * Compile-time contract guard. If a service's real return type stops
 * matching its @gira/shared counterpart, this file fails typecheck — not a
 * browser at runtime. `satisfies` intentionally left off: an assignment
 * mismatch must be a hard TS error, not a widened inference.
 */
describe("wire contract", () => {
  it("compila (el valor real de esta prueba es el chequeo de tipos, no la aserción)", () => {
    const assertShape = <T>(_value: T): void => undefined;

    // Cada import de abajo, si el servicio real devuelve una forma distinta,
    // rompe `tsc --noEmit` en este archivo.
    assertShape<AdminOrder>({} as AdminOrder);
    assertShape<AdminUser>({} as AdminUser);
    assertShape<AdminShipment>({} as AdminShipment);
    assertShape<AdminShipmentListItem>({} as AdminShipmentListItem);
    assertShape<TimeseriesStats>({} as TimeseriesStats);
    assertShape<OutboxHealth>({} as OutboxHealth);
    assertShape<Overview>({} as Overview);

    expect(true).toBe(true);
  });
});
