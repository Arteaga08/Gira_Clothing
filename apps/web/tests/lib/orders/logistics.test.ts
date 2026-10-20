import { DisputeStatus, OrderStatus, ShippingLabelStatus } from "@gira/shared";
import { describe, expect, it } from "vitest";
import { logisticsStateOf } from "@/lib/orders/logistics";

const ready = { status: ShippingLabelStatus.READY, trackingNumber: "5012345678" };

describe("logisticsStateOf: sin guía que mostrar", () => {
  it("pago pendiente: avisa que la guía llega con el pago", () => {
    const state = logisticsStateOf({ status: OrderStatus.PENDING_PAYMENT });
    expect(state.emptyCopy).toBe("Disponible cuando se confirme el pago.");
    expect(state).toMatchObject({ canPrepare: false, canShip: false, canRetryLabel: false });
  });

  it.each([OrderStatus.CANCELLED, OrderStatus.EXPIRED, OrderStatus.REFUNDED])("%s: no se enviará", (status) => {
    expect(logisticsStateOf({ status }).emptyCopy).toBe("Este pedido no se enviará.");
  });

  it("pagado sin guía todavía: se puede preparar pero no enviar", () => {
    const state = logisticsStateOf({ status: OrderStatus.PAID });
    expect(state.emptyCopy).toBe("La guía se genera al confirmarse el pago.");
    expect(state).toMatchObject({ canPrepare: true, canShip: false });
  });
});

describe("logisticsStateOf: marcar enviado", () => {
  it("pagado con guía lista: explica que falta pasarlo a en proceso", () => {
    const state = logisticsStateOf({ status: OrderStatus.PAID, label: ready });
    expect(state).toMatchObject({
      canPrepare: true,
      canShip: false,
      shipBlockedReason: "Primero pásalo a en proceso.",
      emptyCopy: null,
    });
  });

  it("en proceso con guía lista: se puede enviar", () => {
    const state = logisticsStateOf({ status: OrderStatus.PROCESSING, label: ready });
    expect(state).toMatchObject({ canShip: true, shipBlockedReason: null, canPrepare: false });
  });

  it.each([ShippingLabelStatus.PENDING, ShippingLabelStatus.REQUESTED])("guía %s: todavía no está lista", (status) => {
    const state = logisticsStateOf({ status: OrderStatus.PROCESSING, label: { status } });
    expect(state).toMatchObject({ canShip: false, shipBlockedReason: "La guía todavía no está lista." });
  });

  it("guía lista sin número de rastreo no cuenta como lista", () => {
    const state = logisticsStateOf({
      status: OrderStatus.PROCESSING,
      label: { status: ShippingLabelStatus.READY },
    });
    expect(state.canShip).toBe(false);
  });

  it.each([DisputeStatus.OPEN, DisputeStatus.LOST])("disputa %s bloquea el envío", (disputeStatus) => {
    const state = logisticsStateOf({ status: OrderStatus.PROCESSING, label: ready, disputeStatus });
    expect(state).toMatchObject({
      canShip: false,
      shipBlockedReason: "Hay una disputa de pago abierta o perdida.",
    });
  });

  it.each([DisputeStatus.WON, DisputeStatus.WITHDRAWN])("disputa %s ya no bloquea", (disputeStatus) => {
    expect(logisticsStateOf({ status: OrderStatus.PROCESSING, label: ready, disputeStatus }).canShip).toBe(true);
  });
});

describe("logisticsStateOf: reintentar guía", () => {
  it("guía con error en pagado: reintento simple, sin advertencia", () => {
    const state = logisticsStateOf({ status: OrderStatus.PAID, label: { status: ShippingLabelStatus.FAILED } });
    expect(state).toMatchObject({ canRetryLabel: true, retryNeedsWarning: false });
  });

  it("guía por revisar: el reintento advierte de una segunda guía", () => {
    const state = logisticsStateOf({
      status: OrderStatus.PROCESSING,
      label: { status: ShippingLabelStatus.NEEDS_REVIEW },
    });
    expect(state).toMatchObject({ canRetryLabel: true, retryNeedsWarning: true });
  });

  it("una guía que ya tiene número nunca se reintenta (el API lo rechaza y compraría otra)", () => {
    const state = logisticsStateOf({
      status: OrderStatus.PROCESSING,
      label: { status: ShippingLabelStatus.NEEDS_REVIEW, trackingNumber: "5012345678" },
    });
    expect(state.canRetryLabel).toBe(false);
    expect(state.retryNeedsWarning).toBe(false);
  });

  it("guía lista no se reintenta", () => {
    expect(logisticsStateOf({ status: OrderStatus.PROCESSING, label: ready }).canRetryLabel).toBe(false);
  });

  it("un pedido ya enviado no reintenta guía aunque quede por revisar", () => {
    const state = logisticsStateOf({
      status: OrderStatus.SHIPPED,
      label: { status: ShippingLabelStatus.NEEDS_REVIEW },
    });
    expect(state.canRetryLabel).toBe(false);
  });
});
