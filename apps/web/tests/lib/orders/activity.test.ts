import { AuditAction } from "@gira/shared";
import { describe, expect, it } from "vitest";
import { activityActorLabel, activityLabel } from "@/lib/orders/activity";

describe("activityLabel", () => {
  it.each([
    [AuditAction.ORDER_MARKED_SHIPPED, "Marcado como enviado"],
    [AuditAction.LABEL_NEEDS_REVIEW, "Guía por revisar"],
    [AuditAction.ORDER_SHIPPING_ADDRESS_UPDATED, "Dirección corregida"],
    [AuditAction.PAYMENT_SUCCEEDED, "Pago confirmado"],
    [AuditAction.STOCK_COMMIT_MISSED, "Pagado sin stock descontado"],
    [AuditAction.STOCK_RESERVATION_RELEASED, "Reserva de stock liberada"],
  ])("%s se muestra como «%s»", (action, label) => {
    expect(activityLabel(action)).toBe(label);
  });

  // Only the actions the order-activity endpoint can return (orders, payments, shipping modules).
  it.each(Object.values(AuditAction).filter((action) => /^(order|payment|label|tracking|refund)_|^stock_(reserv|restock|commit)/.test(action)))(
    "%s no se muestra en crudo",
    (action) => {
      expect(activityLabel(action)).not.toBe(action);
    },
  );

  it("una acción sin traducción se muestra tal cual, sin ocultarla", () => {
    expect(activityLabel("accion_nueva")).toBe("accion_nueva");
  });
});

describe("activityActorLabel", () => {
  it("el sistema se llama Sistema", () => {
    expect(activityActorLabel({ actorType: "system" })).toBe("Sistema");
  });

  it("una persona del equipo se llama Equipo y nunca expone su id", () => {
    const label = activityActorLabel({ actorType: "user", actorId: "68f2ab12c3d4e5f6a7b8c9d0" });
    expect(label).toBe("Equipo");
    expect(label).not.toContain("68f2");
  });
});
