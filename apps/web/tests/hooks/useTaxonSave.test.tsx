import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTaxonSave } from "@/hooks/useTaxonSave";
import { ApiError } from "@/lib/api/ApiError";
import type { TaxonConfig } from "@/lib/taxonomy/config";

const client = { create: vi.fn(), update: vi.fn(), retire: vi.fn(), reactivate: vi.fn() };
const CONFIG = {
  client,
  limits: { nameMin: 2, nameMax: 80, descriptionMax: 500 },
} as unknown as TaxonConfig;
const BASELINE = { name: "Florales", description: "", color: null };

beforeEach(() => {
  Object.values(client).forEach((mock) => mock.mockReset());
});

describe("useTaxonSave", () => {
  it("create manda el cuerpo recortado y resuelve true", async () => {
    client.create.mockResolvedValue({});
    const { result } = renderHook(() => useTaxonSave(CONFIG));
    let done = false;
    await act(async () => {
      done = await result.current.create({ name: " Rayas ", description: "", color: null });
    });
    expect(done).toBe(true);
    expect(client.create).toHaveBeenCalledWith({ name: "Rayas" });
  });

  it("create con un nombre inválido no hace ninguna petición", async () => {
    const { result } = renderHook(() => useTaxonSave(CONFIG));
    let done = true;
    await act(async () => {
      done = await result.current.create({ name: "a", description: "", color: null });
    });
    expect(done).toBe(false);
    expect(client.create).not.toHaveBeenCalled();
  });

  it("update sin cambios resuelve true sin pedir nada", async () => {
    const { result } = renderHook(() => useTaxonSave(CONFIG));
    let done = false;
    await act(async () => {
      done = await result.current.update("f1", { name: "Florales", description: "", color: null }, BASELINE);
    });
    expect(done).toBe(true);
    expect(client.update).not.toHaveBeenCalled();
  });

  it("update manda solo lo que cambió", async () => {
    client.update.mockResolvedValue({});
    const { result } = renderHook(() => useTaxonSave(CONFIG));
    await act(async () => {
      await result.current.update("f1", { name: "Florales 2", description: "", color: null }, BASELINE);
    });
    expect(client.update).toHaveBeenCalledWith("f1", { name: "Florales 2" });
  });

  it("un 409 de retirar deja el mensaje del API en error y resuelve false", async () => {
    client.retire.mockRejectedValue(new ApiError("No puedes retirar una familia con estampados activos.", "http", 409));
    const { result } = renderHook(() => useTaxonSave(CONFIG));
    let done = true;
    await act(async () => {
      done = await result.current.retire("f1");
    });
    expect(done).toBe(false);
    expect(result.current.error).toBe("No puedes retirar una familia con estampados activos.");
    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });

  it("un fallo que no es del API usa el mensaje genérico", async () => {
    client.reactivate.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useTaxonSave(CONFIG));
    await act(async () => {
      await result.current.reactivate("f1");
    });
    expect(result.current.error).toBe("Inténtalo de nuevo en un momento.");
  });
});
