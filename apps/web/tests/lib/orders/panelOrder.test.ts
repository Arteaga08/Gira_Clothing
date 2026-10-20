import { describe, expect, it } from "vitest";
import { toPanelOrder } from "@/lib/orders/panelOrder";
import { ACTOR_ID_SENTINEL, PUBLIC_ID_SENTINEL, USER_ID_SENTINEL, makeRawOrder } from "../../helpers/orders";

describe("toPanelOrder", () => {
  it("quita el publicId, el id de usuario y el historial con ids de actor", () => {
    const panel = toPanelOrder(makeRawOrder());
    expect(panel).not.toHaveProperty("publicId");
    expect(panel).not.toHaveProperty("user");
    expect(panel).not.toHaveProperty("statusHistory");
    expect(JSON.stringify(panel)).not.toContain(PUBLIC_ID_SENTINEL);
    expect(JSON.stringify(panel)).not.toContain(USER_ID_SENTINEL);
    expect(JSON.stringify(panel)).not.toContain(ACTOR_ID_SENTINEL);
  });

  it("conserva todo lo que el panel sí usa", () => {
    const raw = makeRawOrder();
    const panel = toPanelOrder(raw);
    expect(panel.orderNumber).toBe(raw.orderNumber);
    expect(panel.id).toBe(raw.id);
    expect(panel.lines).toEqual(raw.lines);
    expect(panel.label).toEqual(raw.label);
    expect(panel.payment.intentId).toBe(raw.payment.intentId);
  });

  it("no muta el pedido original", () => {
    const raw = makeRawOrder();
    toPanelOrder(raw);
    expect(raw.publicId).toBe(PUBLIC_ID_SENTINEL);
  });
});
