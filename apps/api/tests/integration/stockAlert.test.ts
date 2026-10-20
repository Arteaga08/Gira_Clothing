import { describe, it, expect, vi } from "vitest";
import { NotificationType } from "@gira/shared";
import { seedVariant } from "../helpers/seedInventory.js";
import { Variant } from "../../src/models/Variant.js";
import { Notification } from "../../src/models/Notification.js";
import { Settings } from "../../src/models/Settings.js";
import { getSettings } from "../../src/services/settingsService.js";
import { evaluateStockAlerts } from "../../src/services/stockAlertService.js";
import { setOnHand, adjustOnHand } from "../../src/services/inventoryService.js";
import { Types } from "mongoose";
import { reserveStock, releaseReservation } from "../../src/services/reservationService.js";
import * as notifications from "../../src/services/notificationService.js";

const CTX = {};

const setThreshold = async (n: number) => {
  const settings = await getSettings();
  await Settings.updateOne({ _id: settings._id }, { $set: { "inventory.lowStockThreshold": n } });
};
const sent = (type: NotificationType, sku: string) =>
  Notification.find({ type, "payload.sku": sku }).lean();

describe("stockAlertService · un disparo por nivel", () => {
  it("avisa agotado una sola vez aunque haya 20 ajustes concurrentes", async () => {
    await setThreshold(3);
    const v = await seedVariant({ tag: "AL1", onHand: 20 });
    await Promise.all(Array.from({ length: 20 }, () => adjustOnHand(v.id, -1, CTX)));
    expect((await Variant.findById(v.id).lean())?.onHand).toBe(0);
    expect(await sent(NotificationType.TEAM_STOCK_OUT, v.sku)).toHaveLength(1);
    expect((await Variant.findById(v.id).lean())?.stockAlertLevel).toBe("out");
  });

  it("evaluar varias veces seguidas no repite el aviso", async () => {
    await setThreshold(3);
    const v = await seedVariant({ tag: "AL2", onHand: 2 });
    await Promise.all([evaluateStockAlerts([v.id]), evaluateStockAlerts([v.id]), evaluateStockAlerts([v.id])]);
    await evaluateStockAlerts([v.id]);
    expect(await sent(NotificationType.TEAM_STOCK_LOW, v.sku)).toHaveLength(1);
  });

  it("low -> out vuelve a avisar, con el tipo nuevo", async () => {
    await setThreshold(3);
    const v = await seedVariant({ tag: "AL3", onHand: 10 });
    await setOnHand(v.id, 3, CTX);
    await setOnHand(v.id, 0, CTX);
    expect(await sent(NotificationType.TEAM_STOCK_LOW, v.sku)).toHaveLength(1);
    expect(await sent(NotificationType.TEAM_STOCK_OUT, v.sku)).toHaveLength(1);
  });

  it("out -> low al reponer no manda aviso nuevo, pero un nuevo agotamiento tras superar el umbral sí", async () => {
    await setThreshold(3);
    const v = await seedVariant({ tag: "AL4", onHand: 1 });
    await setOnHand(v.id, 0, CTX);
    await setOnHand(v.id, 2, CTX); // out -> low: silent
    expect(await sent(NotificationType.TEAM_STOCK_LOW, v.sku)).toHaveLength(0);
    expect((await Variant.findById(v.id).lean())?.stockAlertLevel).toBe("out");
    await setOnHand(v.id, 0, CTX); // back to out without climbing over the threshold: no second ping
    expect(await sent(NotificationType.TEAM_STOCK_OUT, v.sku)).toHaveLength(1);
    await setOnHand(v.id, 2, CTX);
    await setOnHand(v.id, 10, CTX); // rearm
    expect((await Variant.findById(v.id).lean())?.stockAlertLevel).toBeNull();
    await setOnHand(v.id, 0, CTX);
    expect(await sent(NotificationType.TEAM_STOCK_OUT, v.sku)).toHaveLength(2);
  });

  it("no avisa si el stock está sobre el umbral y el umbral viene de Settings", async () => {
    await setThreshold(1);
    const v = await seedVariant({ tag: "AL5", onHand: 5 });
    await setOnHand(v.id, 2, CTX);
    expect(await sent(NotificationType.TEAM_STOCK_LOW, v.sku)).toHaveLength(0);
    await setOnHand(v.id, 1, CTX);
    expect(await sent(NotificationType.TEAM_STOCK_LOW, v.sku)).toHaveLength(1);
  });

  it("el payload lleva modelo, print, SKU, disponible y umbral", async () => {
    await setThreshold(3);
    const v = await seedVariant({ tag: "AL6", onHand: 9, productName: "Hoodie", printName: "Bruma" });
    await setOnHand(v.id, 0, CTX);
    const [n] = await sent(NotificationType.TEAM_STOCK_OUT, v.sku);
    expect(n?.payload).toMatchObject({ productName: "Hoodie", printName: "Bruma", available: 0, threshold: 3 });
    expect(n?.channel).toBe("team");
  });

  it("un fallo al encolar no rompe el ajuste", async () => {
    await setThreshold(3);
    const v = await seedVariant({ tag: "AL7", onHand: 5 });
    const spy = vi.spyOn(notifications, "enqueueNotification").mockRejectedValue(new Error("boom"));
    try {
      const view = await setOnHand(v.id, 0, CTX);
      expect(view.onHand).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("stockAlertService · reservas", () => {
  it("apartar todo avisa agotado y liberar la reserva rearma el marcador", async () => {
    await setThreshold(3);
    const v = await seedVariant({ tag: "AR1", onHand: 4 });
    const orderId = new Types.ObjectId();
    await reserveStock(orderId, [{ variant: new Types.ObjectId(v.id), qty: 4 }], 30, CTX);
    expect(await sent(NotificationType.TEAM_STOCK_OUT, v.sku)).toHaveLength(1);
    expect((await Variant.findById(v.id).lean())?.stockAlertLevel).toBe("out");

    expect(await releaseReservation(orderId, "expired")).toBe(true);
    expect((await Variant.findById(v.id).lean())?.stockAlertLevel).toBeNull();
  });
});
