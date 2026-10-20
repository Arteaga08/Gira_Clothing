import { OrderStatus } from "@gira/shared";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOrderList } from "@/hooks/useOrderList";
import { useOrderSummary } from "@/hooks/useOrderSummary";
import { ApiError } from "@/lib/api/ApiError";
import { parseOrderFilters } from "@/lib/orders/filters";

const { listOrdersMock, summaryMock } = vi.hoisted(() => ({ listOrdersMock: vi.fn(), summaryMock: vi.fn() }));
vi.mock("@/lib/api/adminOrders", () => ({ listOrders: listOrdersMock, getOrderSummary: summaryMock }));

const page = (ids: string[]) => ({ orders: ids.map((id) => ({ id, orderNumber: `GC-${id}` })), meta: { total: ids.length, page: 1, pages: 1, limit: 20 } });

beforeEach(() => {
  listOrdersMock.mockReset();
  summaryMock.mockReset();
});

describe("useOrderList", () => {
  it("empieza cargando y pasa a ready con los pedidos y el meta", async () => {
    listOrdersMock.mockResolvedValue(page(["A1"]));
    const { result } = renderHook(() => useOrderList(parseOrderFilters({})));
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.orders).toHaveLength(1);
    expect(result.current.meta?.total).toBe(1);
    expect(listOrdersMock).toHaveBeenCalledWith(expect.stringContaining("status=paid"));
  });

  it("al cambiar de filtros vuelve a cargar con la nueva consulta", async () => {
    listOrdersMock.mockResolvedValue(page(["A1"]));
    const { result, rerender } = renderHook(({ tab }) => useOrderList(parseOrderFilters({ tab })), {
      initialProps: { tab: "paid" },
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    listOrdersMock.mockResolvedValue(page(["B2", "B3"]));
    rerender({ tab: "shipped" });
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.orders).toHaveLength(2));
    expect(listOrdersMock).toHaveBeenLastCalledWith(expect.stringContaining("status=shipped"));
  });

  it("descarta la respuesta vieja si llega después de cambiar de filtros", async () => {
    let resolveOld: (value: unknown) => void = () => {};
    listOrdersMock.mockImplementationOnce(() => new Promise((resolve) => (resolveOld = resolve)));
    const { result, rerender } = renderHook(({ tab }) => useOrderList(parseOrderFilters({ tab })), {
      initialProps: { tab: "paid" },
    });
    listOrdersMock.mockResolvedValue(page(["NEW"]));
    rerender({ tab: "shipped" });
    await waitFor(() => expect(result.current.orders[0]?.id).toBe("NEW"));
    await act(async () => resolveOld(page(["OLD"])));
    expect(result.current.orders[0]?.id).toBe("NEW");
  });

  it("un error de la API queda en status error con su mensaje", async () => {
    listOrdersMock.mockRejectedValue(new ApiError("Sin permiso.", "http", 403));
    const { result } = renderHook(() => useOrderList(parseOrderFilters({})));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("Sin permiso.");
  });

  it("refresh vuelve a consultar sin mostrar el esqueleto", async () => {
    listOrdersMock.mockResolvedValue(page(["A1"]));
    const { result } = renderHook(() => useOrderList(parseOrderFilters({})));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    listOrdersMock.mockResolvedValue(page(["A1", "A2"]));
    act(() => result.current.refresh());
    expect(result.current.status).toBe("ready");
    await waitFor(() => expect(result.current.orders).toHaveLength(2));
  });
});

describe("useOrderSummary", () => {
  it("expone los conteos por estado", async () => {
    summaryMock.mockResolvedValue({ countsByStatus: { [OrderStatus.PAID]: 2 } });
    const { result } = renderHook(() => useOrderSummary());
    expect(result.current.counts).toBeNull();
    await waitFor(() => expect(result.current.counts?.paid).toBe(2));
  });

  it("si falla se queda sin conteos y no lanza", async () => {
    summaryMock.mockRejectedValue(new ApiError("caído", "network"));
    const { result } = renderHook(() => useOrderSummary());
    await waitFor(() => expect(summaryMock).toHaveBeenCalled());
    expect(result.current.counts).toBeNull();
  });
});
