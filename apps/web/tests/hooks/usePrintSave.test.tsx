import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/ApiError";
import { usePrintSave } from "@/hooks/usePrintSave";

const api = vi.hoisted(() => ({
  createAdminPrint: vi.fn(),
  updateAdminPrint: vi.fn(),
  retirePrint: vi.fn(),
  reactivatePrint: vi.fn(),
}));
vi.mock("@/lib/api/adminPrints", () => api);

const IMAGE = { url: "https://cdn/x.jpg", publicId: "gira/x", width: 1, height: 1 };
const VALUES = { name: " Rosas ", sku: "flr-001", familyId: "f1", image: IMAGE, homePosition: "" };
const BASELINE = { name: "Rosas", familyId: "f1", imageUrl: IMAGE.url, homePosition: null };

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset().mockResolvedValue({}));
});

describe("usePrintSave", () => {
  it("crear no sale a la red con datos inválidos", async () => {
    const { result } = renderHook(() => usePrintSave());
    let ok = true;
    await act(async () => {
      ok = await result.current.create({ ...VALUES, name: "R" });
    });
    expect(ok).toBe(false);
    expect(api.createAdminPrint).not.toHaveBeenCalled();
  });

  it("crear manda el cuerpo limpio", async () => {
    const { result } = renderHook(() => usePrintSave());
    await act(async () => {
      expect(await result.current.create(VALUES)).toBe(true);
    });
    expect(api.createAdminPrint).toHaveBeenCalledWith({ name: "Rosas", sku: "FLR-001", family: "f1", image: IMAGE });
  });

  it("editar sin cambios no hace petición", async () => {
    const { result } = renderHook(() => usePrintSave());
    await act(async () => {
      expect(await result.current.update("p1", VALUES, BASELINE)).toBe(true);
    });
    expect(api.updateAdminPrint).not.toHaveBeenCalled();
  });

  it("editar manda solo lo que cambió", async () => {
    const { result } = renderHook(() => usePrintSave());
    await act(async () => {
      await result.current.update("p1", { ...VALUES, name: "Otro" }, BASELINE);
    });
    expect(api.updateAdminPrint).toHaveBeenCalledWith("p1", { name: "Otro" });
  });

  it("un error del API queda como mensaje y se puede limpiar", async () => {
    api.retirePrint.mockRejectedValue(new ApiError("No puedes retirar un estampado con variantes activas.", "http", 409));
    const { result } = renderHook(() => usePrintSave());
    await act(async () => {
      expect(await result.current.retire("p1")).toBe(false);
    });
    expect(result.current.error).toBe("No puedes retirar un estampado con variantes activas.");
    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });

  it("un fallo inesperado da el mensaje genérico", async () => {
    api.reactivatePrint.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => usePrintSave());
    await act(async () => {
      await result.current.reactivate("p1");
    });
    expect(result.current.error).toBe("Inténtalo de nuevo en un momento.");
  });
});
