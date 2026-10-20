import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { OrderStatus, NotificationType } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { Order } from "../../src/models/Order.js";
import { Notification } from "../../src/models/Notification.js";
import { processShippingLabels } from "../../src/jobs/processShippingLabels.js";
import { loginAsAdmin } from "../helpers/auth.js";
import { createPendingOrder, seedCatalogVariant } from "../helpers/orders.js";
import { installFakeShippingProvider, restoreShippingProvider } from "../helpers/fakeShippingProvider.js";
import { settleLabelWork } from "../../src/services/shippingLabelService.js";

const app = buildApp();
let variantId: string;
beforeEach(async () => {
  const cookie = await loginAsAdmin(app);
  variantId = await seedCatalogVariant(app, cookie, "LABELJOB", 200);
});
afterEach(() => restoreShippingProvider());

const paidOrderWithLabel = async (label: Record<string, unknown>) => {
  const order = await createPendingOrder(variantId);
  await Order.updateOne({ _id: order._id }, { $set: { status: OrderStatus.PAID, label: { attempts: 0, cancelAttempts: 0, ...label } } });
  return order._id;
};

describe("processShippingLabels", () => {
  it("compra las guías vencidas y deja intactas las que aún no les toca", async () => {
    const due = await paidOrderWithLabel({ status: "pending", nextAttemptAt: new Date(Date.now() - 1000) });
    const later = await paidOrderWithLabel({ status: "failed", nextAttemptAt: new Date(Date.now() + 3_600_000) });
    await processShippingLabels();
    expect((await Order.findById(due).lean())?.label?.status).toBe("ready");
    expect((await Order.findById(later).lean())?.label?.status).toBe("failed");
  });

  it("manda a needs_review una guía 'requested' con el lease vencido y avisa una vez", async () => {
    const id = await paidOrderWithLabel({ status: "requested", attempts: 1, requestedAt: new Date(Date.now() - 11 * 60_000) });
    const fresh = await paidOrderWithLabel({ status: "requested", attempts: 1, requestedAt: new Date() });
    await processShippingLabels();
    await processShippingLabels();
    expect((await Order.findById(id).lean())?.label?.status).toBe("needs_review");
    expect((await Order.findById(id).lean())?.label?.lastError).toBe("lease_expired");
    expect((await Order.findById(fresh).lean())?.label?.status).toBe("requested");
    expect(await Notification.countDocuments({ order: id, type: NotificationType.TEAM_SHIPPING_LABEL_FAILED })).toBe(1);
  });

  it("un fallo de una orden no detiene al resto del lote", async () => {
    const fake = installFakeShippingProvider();
    const a = await paidOrderWithLabel({ status: "pending", nextAttemptAt: new Date(Date.now() - 1000) });
    const b = await paidOrderWithLabel({ status: "pending", nextAttemptAt: new Date(Date.now() - 1000) });
    fake.createLabel.mockRejectedValueOnce(new Error("boom"));
    await processShippingLabels();
    await settleLabelWork();
    const statuses = [(await Order.findById(a).lean())?.label?.status, (await Order.findById(b).lean())?.label?.status];
    expect(statuses.sort()).toEqual(["needs_review", "ready"]);
  });
});
