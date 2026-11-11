import { describe, it, expect, vi } from "vitest";
import type { CreatedOrder, PublicOrder, Wire } from "@gira/shared";
import { ApiError } from "@/lib/api/ApiError";
import { preparePayment, resumePayment } from "@/lib/checkout/preparePayment";

const created = (total: number, withSecret = true): Wire<CreatedOrder> => ({
  order: { publicId: "p".repeat(43), orderNumber: "GC-1", total } as unknown as Wire<PublicOrder>,
  ...(withSecret ? { clientSecret: "pi_1_secret_x" } : {}),
});

describe("preparePayment", () => {
  it("crea la orden con la clave y devuelve el secreto si el total coincide", async () => {
    const create = vi.fn().mockResolvedValue(created(130130));
    const result = await preparePayment({ key: "k1", shownTotal: 130130, create, forgetKey: vi.fn() });
    expect(create).toHaveBeenCalledWith("k1");
    expect(result).toMatchObject({ ok: true, clientSecret: "pi_1_secret_x" });
  });

  it("si el total de la orden difiere del mostrado, no devuelve secreto y manda a revisar el pedido", async () => {
    const forgetKey = vi.fn();
    const result = await preparePayment({
      key: "k1",
      shownTotal: 130130,
      create: vi.fn().mockResolvedValue(created(140000)),
      forgetKey,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.action).toBe("resume");
      expect(result.failure.message).toContain("$1,400.00");
    }
    expect(forgetKey).not.toHaveBeenCalled();
  });

  it("sin clientSecret, la orden existe pero no se puede pagar aquí: reanudar desde Mis pedidos", async () => {
    const result = await preparePayment({
      key: "k1",
      shownTotal: 100,
      create: vi.fn().mockResolvedValue(created(100, false)),
      forgetKey: vi.fn(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.action).toBe("resume");
  });

  it("un rechazo definitivo (4xx) libera la clave", async () => {
    const forgetKey = vi.fn();
    const result = await preparePayment({
      key: "k1",
      shownTotal: 100,
      create: vi.fn().mockRejectedValue(new ApiError("La cotización de envío venció. Vuelve a elegir tu envío.", "http", 409)),
      forgetKey,
    });
    expect(forgetKey).toHaveBeenCalledOnce();
    if (!result.ok) expect(result.failure.action).toBe("requote");
  });

  it("un error de red conserva la clave: el reintento no duplica la orden", async () => {
    const forgetKey = vi.fn();
    const result = await preparePayment({
      key: "k1",
      shownTotal: 100,
      create: vi.fn().mockRejectedValue(new ApiError("sin conexión", "network")),
      forgetKey,
    });
    expect(forgetKey).not.toHaveBeenCalled();
    if (!result.ok) expect(result.failure.action).toBe("retry");
  });
});

describe("resumePayment", () => {
  it("pide el secreto del pedido pendiente y lo devuelve", async () => {
    const pay = vi.fn().mockResolvedValue(created(100));
    const result = await resumePayment(pay);
    expect(pay).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ ok: true, clientSecret: "pi_1_secret_x" });
  });

  it("si el pedido ya no está por pagar, explica la falla (no reintenta a ciegas)", async () => {
    const result = await resumePayment(vi.fn().mockRejectedValue(new ApiError("Este pedido ya no está por pagar.", "http", 409)));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.message).toBe("Este pedido ya no está por pagar.");
      expect(result.failure.definitive).toBe(true);
    }
  });

  it("un error de red permite reintentar", async () => {
    const result = await resumePayment(vi.fn().mockRejectedValue(new ApiError("x", "network")));
    if (!result.ok) expect(result.failure.action).toBe("retry");
  });

  it("sin clientSecret no hay con qué cobrar", async () => {
    const result = await resumePayment(vi.fn().mockResolvedValue(created(100, false)));
    expect(result.ok).toBe(false);
  });
});
