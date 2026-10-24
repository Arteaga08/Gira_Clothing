import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/ApiError";
import { usePrintList } from "@/hooks/usePrintList";
import type { PrintFilters } from "@/lib/prints/filters";
import type { PanelPrint } from "@/lib/prints/panelPrint";

const api = vi.hoisted(() => ({ listPrints: vi.fn() }));
vi.mock("@/lib/api/adminPrints", () => api);

const FILTERS: PrintFilters = { status: "active", sort: "name", page: 1 };
const PRINT: PanelPrint = {
  id: "p1",
  name: "Rosas",
  sku: "FLR-001",
  family: { id: "f1", name: "Florales" },
  imageUrl: "https://cdn/x.jpg",
  isActive: true,
  homePosition: null,
  homeBlurb: "",
  variantCount: 0,
  activeVariantCount: 0,
  activeProducts: [],
};
const META = { total: 1, page: 1, pages: 1, limit: 24 };

beforeEach(() => {
  api.listPrints.mockReset();
});

describe("usePrintList", () => {
  it("carga la primera página con la consulta de los filtros", async () => {
    api.listPrints.mockResolvedValue({ prints: [PRINT], meta: META });
    const { result } = renderHook(() => usePrintList(FILTERS));
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.prints).toEqual([PRINT]);
    expect(api.listPrints).toHaveBeenCalledWith(expect.stringContaining("isActive=true"));
  });

  it("un cambio de filtros vuelve a «loading»", async () => {
    api.listPrints.mockResolvedValue({ prints: [PRINT], meta: META });
    const { result, rerender } = renderHook(({ filters }) => usePrintList(filters), { initialProps: { filters: FILTERS } });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    api.listPrints.mockReturnValue(new Promise(() => {}));
    rerender({ filters: { ...FILTERS, status: "all" } });
    await waitFor(() => expect(result.current.status).toBe("loading"));
  });

  it("falla en la primera carga: error con su mensaje", async () => {
    api.listPrints.mockRejectedValue(new ApiError("Sin conexión.", "network"));
    const { result } = renderHook(() => usePrintList(FILTERS));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("Sin conexión.");
  });

  it("un refresco que falla conserva las tarjetas y muestra el error", async () => {
    api.listPrints.mockResolvedValueOnce({ prints: [PRINT], meta: META });
    const { result } = renderHook(() => usePrintList(FILTERS));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    api.listPrints.mockRejectedValueOnce(new ApiError("Falló.", "network"));
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.error).toBe("Falló."));
    expect(result.current.status).toBe("ready");
    expect(result.current.prints).toEqual([PRINT]);
  });

  it("una página fuera de rango avisa con la última existente", async () => {
    api.listPrints.mockResolvedValue({ prints: [], meta: { ...META, total: 30, pages: 2, page: 5 } });
    const onOut = vi.fn();
    renderHook(() => usePrintList({ ...FILTERS, page: 5 }, undefined, onOut));
    await waitFor(() => expect(onOut).toHaveBeenCalledWith(2));
  });
});
