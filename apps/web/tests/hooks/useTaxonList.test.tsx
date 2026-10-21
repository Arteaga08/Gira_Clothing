import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTaxonList } from "@/hooks/useTaxonList";
import { ApiError } from "@/lib/api/ApiError";
import type { TaxonConfig } from "@/lib/taxonomy/config";
import type { TaxonFilters } from "@/lib/taxonomy/filters";
import type { PanelTaxon } from "@/lib/taxonomy/panelTaxon";

const list = vi.fn();
const CONFIG = { title: "Familias", client: { list } } as unknown as TaxonConfig;
const FILTERS: TaxonFilters = { status: "active", sort: "name", page: 1 };
const ITEM: PanelTaxon = {
  id: "f1",
  name: "Florales",
  description: "",
  isActive: true,
  childCount: 0,
  activeChildCount: 0,
  activeChildren: [],
  updatedAt: "2026-10-20T00:00:00.000Z",
};
const META = { total: 1, page: 1, pages: 1, limit: 24 };

beforeEach(() => {
  list.mockReset();
});

describe("useTaxonList", () => {
  it("carga la primera página con la consulta de los filtros", async () => {
    list.mockResolvedValue({ items: [ITEM], meta: META });
    const { result } = renderHook(() => useTaxonList(CONFIG, FILTERS));
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.items).toEqual([ITEM]);
    expect(list).toHaveBeenCalledWith(expect.stringContaining("isActive=true"));
  });

  it("un cambio de filtros vuelve a «loading»", async () => {
    list.mockResolvedValue({ items: [ITEM], meta: META });
    const { result, rerender } = renderHook(({ filters }) => useTaxonList(CONFIG, filters), {
      initialProps: { filters: FILTERS },
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    list.mockReturnValue(new Promise(() => {}));
    rerender({ filters: { ...FILTERS, status: "all" } });
    await waitFor(() => expect(result.current.status).toBe("loading"));
  });

  it("falla en la primera carga: error con su mensaje", async () => {
    list.mockRejectedValue(new ApiError("Sin conexión.", "network"));
    const { result } = renderHook(() => useTaxonList(CONFIG, FILTERS));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("Sin conexión.");
  });

  it("un error que no es de la API usa el mensaje genérico", async () => {
    list.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useTaxonList(CONFIG, FILTERS));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("No se pudieron cargar las familias.");
  });

  it("un refresco que falla conserva las filas y muestra el error", async () => {
    list.mockResolvedValueOnce({ items: [ITEM], meta: META });
    const { result } = renderHook(() => useTaxonList(CONFIG, FILTERS));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    list.mockRejectedValueOnce(new ApiError("Falló.", "network"));
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.error).toBe("Falló."));
    expect(result.current.status).toBe("ready");
    expect(result.current.items).toEqual([ITEM]);
  });

  it("una página vacía fuera de rango pide la última existente", async () => {
    list.mockResolvedValue({ items: [], meta: { total: 3, page: 4, pages: 2, limit: 24 } });
    const onOut = vi.fn();
    renderHook(() => useTaxonList(CONFIG, { ...FILTERS, page: 4 }, undefined, onOut));
    await waitFor(() => expect(onOut).toHaveBeenCalledWith(2));
  });

  it("descarta la respuesta tardía de una consulta anterior", async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    list.mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)));
    list.mockResolvedValueOnce({ items: [{ ...ITEM, name: "Nueva" }], meta: META });
    const { result, rerender } = renderHook(({ filters }) => useTaxonList(CONFIG, filters), {
      initialProps: { filters: FILTERS },
    });
    rerender({ filters: { ...FILTERS, status: "all" } });
    await waitFor(() => expect(result.current.items[0]?.name).toBe("Nueva"));
    await act(async () => resolveFirst({ items: [{ ...ITEM, name: "Vieja" }], meta: META }));
    expect(result.current.items[0]?.name).toBe("Nueva");
  });
});
