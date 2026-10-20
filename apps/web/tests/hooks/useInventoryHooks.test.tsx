import { act, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/Toast";
import { useInventoryCounts } from "@/hooks/useInventoryCounts";
import { useStockActions } from "@/hooks/useStockActions";
import { useVariantActivity } from "@/hooks/useVariantActivity";
import { useVariantList } from "@/hooks/useVariantList";
import { ApiError } from "@/lib/api/ApiError";
import { parseInventoryFilters } from "@/lib/inventory/filters";

const api = vi.hoisted(() => ({
  listVariants: vi.fn(),
  fetchInventoryCounts: vi.fn(),
  updateStock: vi.fn(),
  getVariantActivity: vi.fn(),
}));
vi.mock("@/lib/api/adminVariants", () => api);

const ID = "68f2ab12c3d4e5f6a7b8c9d0";
const COUNTS = { threshold: 3, total: 10, out: 2, low: 3, ok: 5 };
const page = (ids: string[], pages = 1) => ({
  variants: ids.map((id) => ({ id, sku: `SKU-${id}` })),
  meta: { total: ids.length, page: 1, pages, limit: 100 },
});
const wrapper = ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>;

beforeEach(() => Object.values(api).forEach((mock) => mock.mockReset()));

describe("useVariantList", () => {
  it("empieza cargando y pasa a ready con las variantes y el meta", async () => {
    api.listVariants.mockResolvedValue(page(["A"]));
    const { result } = renderHook(() => useVariantList(parseInventoryFilters({ estado: "bajo" })));
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.variants).toHaveLength(1);
    expect(api.listVariants).toHaveBeenCalledWith(expect.stringContaining("stock=low"));
  });

  it("al cambiar de filtros muestra carga y descarta la respuesta vieja", async () => {
    let resolveOld: (value: unknown) => void = () => {};
    api.listVariants.mockImplementationOnce(() => new Promise((resolve) => (resolveOld = resolve)));
    const { result, rerender } = renderHook(({ estado }) => useVariantList(parseInventoryFilters({ estado })), {
      initialProps: { estado: "bajo" },
    });
    api.listVariants.mockResolvedValue(page(["NEW"]));
    rerender({ estado: "agotado" });
    await waitFor(() => expect(result.current.variants[0]?.id).toBe("NEW"));
    await act(async () => resolveOld(page(["OLD"])));
    expect(result.current.variants[0]?.id).toBe("NEW");
  });

  it("un error de la API queda en status error con su mensaje", async () => {
    api.listVariants.mockRejectedValue(new ApiError("Sin permiso.", "http", 403));
    const { result } = renderHook(() => useVariantList(parseInventoryFilters({})));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("Sin permiso.");
  });

  it("un refresh que falla conserva las filas y deja el aviso", async () => {
    api.listVariants.mockResolvedValue(page(["A"]));
    const { result } = renderHook(() => useVariantList(parseInventoryFilters({})));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    api.listVariants.mockRejectedValue(new ApiError("caído", "network"));
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.error).toBe("caído"));
    expect(result.current.status).toBe("ready");
    expect(result.current.variants).toHaveLength(1);
  });

  it("replaceVariant cambia solo esa fila", async () => {
    api.listVariants.mockResolvedValue(page(["A", "B"]));
    const { result } = renderHook(() => useVariantList(parseInventoryFilters({})));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.replaceVariant({ id: "B", sku: "NUEVO" } as never));
    expect(result.current.variants.map((row) => row.sku)).toEqual(["SKU-A", "NUEVO"]);
  });

  it("una página vacía mayor a 1 avisa la última página real", async () => {
    api.listVariants.mockResolvedValue({ variants: [], meta: { total: 3, page: 4, pages: 2, limit: 100 } });
    const onOutOfRange = vi.fn();
    renderHook(() => useVariantList(parseInventoryFilters({ page: "4" }), undefined, onOutOfRange));
    await waitFor(() => expect(onOutOfRange).toHaveBeenCalledWith(2));
  });
});

describe("useInventoryCounts", () => {
  it("con datos del servidor no vuelve a pedirlos al montar", () => {
    const { result } = renderHook(() => useInventoryCounts(COUNTS));
    expect(result.current.counts).toEqual(COUNTS);
    expect(api.fetchInventoryCounts).not.toHaveBeenCalled();
  });

  it("sin datos del servidor los pide al montar", async () => {
    api.fetchInventoryCounts.mockResolvedValue(COUNTS);
    const { result } = renderHook(() => useInventoryCounts(null));
    expect(result.current.counts).toBeNull();
    await waitFor(() => expect(result.current.counts).toEqual(COUNTS));
  });

  it("refresh actualiza, y si falla conserva los últimos números", async () => {
    api.fetchInventoryCounts.mockResolvedValueOnce({ ...COUNTS, out: 5 });
    const { result } = renderHook(() => useInventoryCounts(COUNTS));
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.counts?.out).toBe(5));
    api.fetchInventoryCounts.mockRejectedValue(new ApiError("caído", "network"));
    act(() => result.current.refresh());
    await waitFor(() => expect(api.fetchInventoryCounts).toHaveBeenCalledTimes(2));
    expect(result.current.counts?.out).toBe(5);
  });
});

describe("useStockActions", () => {
  const VARIANT = { id: ID, sku: "HOOD-BRUMA" };

  it("un ajuste exitoso avisa con el SKU, devuelve la fila y notifica", async () => {
    api.updateStock.mockResolvedValue({ ...VARIANT, available: 12 });
    const onChanged = vi.fn();
    const { result } = renderHook(() => useStockActions(onChanged), { wrapper });

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.adjust(VARIANT, { onHand: 12 });
    });

    expect(api.updateStock).toHaveBeenCalledWith(ID, { onHand: 12 });
    expect(outcome).toMatchObject({ ok: true });
    expect(screen.getByText("Stock de HOOD-BRUMA actualizado")).toBeInTheDocument();
    expect(screen.getByText("Disponible: 12")).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain(ID);
  });

  it("un 409 vuelve como mensaje para el formulario, sin toast y sin refrescar", async () => {
    api.updateStock.mockRejectedValue(new ApiError("Stock insuficiente: la operación dejaría unidades disponibles en negativo.", "http", 409));
    const onChanged = vi.fn();
    const { result } = renderHook(() => useStockActions(onChanged), { wrapper });

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.adjust(VARIANT, { delta: -50 });
    });

    expect(outcome).toEqual({ ok: false, message: "Stock insuficiente: la operación dejaría unidades disponibles en negativo." });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
    expect(result.current.isBusy(ID)).toBe(false);
  });

  it("un fallo sin mensaje usa uno genérico en español", async () => {
    api.updateStock.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useStockActions(() => {}), { wrapper });
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.adjust(VARIANT, { delta: 1 });
    });
    expect(outcome).toEqual({ ok: false, message: "Inténtalo de nuevo en un momento." });
  });

  it("dos envíos en el mismo instante solo mandan una petición", async () => {
    let finish: (value: unknown) => void = () => {};
    api.updateStock.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    const { result } = renderHook(() => useStockActions(() => {}), { wrapper });

    let first: Promise<unknown> = Promise.resolve();
    let second: unknown;
    await act(async () => {
      first = result.current.adjust(VARIANT, { delta: 1 });
      second = await result.current.adjust(VARIANT, { delta: 1 });
    });
    expect(second).toMatchObject({ ok: false });
    expect(api.updateStock).toHaveBeenCalledTimes(1);
    expect(result.current.isBusy(ID)).toBe(true);

    await act(async () => {
      finish({ ...VARIANT, available: 1 });
      await first;
    });
    expect(result.current.isBusy(ID)).toBe(false);
  });
});

describe("useVariantActivity", () => {
  it("sin variante no pide nada", () => {
    renderHook(() => useVariantActivity(null));
    expect(api.getVariantActivity).not.toHaveBeenCalled();
  });

  it("carga el historial y lo expone", async () => {
    api.getVariantActivity.mockResolvedValue([{ id: "1", action: "stock_set" }]);
    const { result } = renderHook(() => useVariantActivity(ID));
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.entries).toHaveLength(1);
  });

  it("al cambiar de variante vuelve a cargando y descarta la respuesta vieja", async () => {
    let resolveOld: (value: unknown) => void = () => {};
    api.getVariantActivity.mockImplementationOnce(() => new Promise((resolve) => (resolveOld = resolve)));
    const { result, rerender } = renderHook(({ id }) => useVariantActivity(id), { initialProps: { id: ID } });
    api.getVariantActivity.mockResolvedValue([{ id: "new" }]);
    rerender({ id: "68f2ab12c3d4e5f6a7b8c9d9" });
    await waitFor(() => expect(result.current.entries[0]?.id).toBe("new"));
    await act(async () => resolveOld([{ id: "old" }]));
    expect(result.current.entries[0]?.id).toBe("new");
  });

  it("un error queda con su mensaje y refresh reintenta", async () => {
    api.getVariantActivity.mockRejectedValueOnce(new ApiError("La variante no existe.", "http", 404));
    const { result } = renderHook(() => useVariantActivity(ID));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("La variante no existe.");
    api.getVariantActivity.mockResolvedValue([]);
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });
});
