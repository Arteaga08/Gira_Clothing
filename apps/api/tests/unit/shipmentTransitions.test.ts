import { describe, it, expect } from "vitest";
import { ShipmentStatus, SHIPMENT_STATUS_LABELS } from "@gira/shared";
import {
  canTransitionShipment,
  assertShipmentTransition,
  LABELS,
} from "../../src/utils/shipmentTransitions.js";

describe("canTransitionShipment", () => {
  it("permite el camino feliz", () => {
    expect(canTransitionShipment(ShipmentStatus.IN_TRANSIT, ShipmentStatus.OUT_FOR_DELIVERY)).toBe(true);
    expect(canTransitionShipment(ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.DELIVERED)).toBe(true);
  });
  it("permite entregar directo desde tránsito", () => {
    expect(canTransitionShipment(ShipmentStatus.IN_TRANSIT, ShipmentStatus.DELIVERED)).toBe(true);
  });
  it("permite marcar devuelto o perdido desde cualquier estado en movimiento", () => {
    for (const from of [ShipmentStatus.IN_TRANSIT, ShipmentStatus.OUT_FOR_DELIVERY]) {
      expect(canTransitionShipment(from, ShipmentStatus.RETURNED)).toBe(true);
      expect(canTransitionShipment(from, ShipmentStatus.LOST)).toBe(true);
    }
  });
  it("prohíbe retroceder", () => {
    expect(canTransitionShipment(ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.IN_TRANSIT)).toBe(false);
  });
  it("prohíbe salir de un estado terminal", () => {
    for (const terminal of [ShipmentStatus.DELIVERED, ShipmentStatus.RETURNED, ShipmentStatus.LOST]) {
      for (const to of Object.values(ShipmentStatus)) {
        expect(canTransitionShipment(terminal, to)).toBe(false);
      }
    }
  });
  it("prohíbe la transición al mismo estado", () => {
    expect(canTransitionShipment(ShipmentStatus.IN_TRANSIT, ShipmentStatus.IN_TRANSIT)).toBe(false);
  });
});

describe("assertShipmentTransition", () => {
  it("lanza 409 con mensaje en español en una transición inválida", () => {
    expect(() =>
      assertShipmentTransition(ShipmentStatus.DELIVERED, ShipmentStatus.IN_TRANSIT),
    ).toThrow(expect.objectContaining({ statusCode: 409 }));
  });
  it("no lanza en una transición válida", () => {
    expect(() =>
      assertShipmentTransition(ShipmentStatus.IN_TRANSIT, ShipmentStatus.DELIVERED),
    ).not.toThrow();
  });
  it("LABELS de @gira/shared coincide con el mapa re-exportado", () => {
    expect(LABELS).toBe(SHIPMENT_STATUS_LABELS);
  });
});
