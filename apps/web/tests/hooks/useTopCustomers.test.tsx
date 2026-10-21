import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTopCustomers } from "@/hooks/useTopCustomers";

const top = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/adminCustomers", () => ({ customerClient: { top } }));

const ranking = { period: "month", sortBy: "spent", from: "a", to: "b", rows: [] };

describe("useTopCustomers", () => {
  beforeEach(() => {
    top.mockReset();
  });

  it("carga y publica el ranking", async () => {
    top.mockResolvedValue(ranking);
    const { result } = renderHook(() => useTopCustomers({ period: "month", sortBy: "spent" }));
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(top).toHaveBeenCalledWith("period=month&sortBy=spent");
  });

  it("vuelve a pedir al cambiar el periodo", async () => {
    top.mockResolvedValue(ranking);
    const { result, rerender } = renderHook(({ period }) => useTopCustomers({ period, sortBy: "spent" }), {
      initialProps: { period: "month" as "month" | "week" },
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    rerender({ period: "week" });
    await waitFor(() => expect(top).toHaveBeenLastCalledWith("period=week&sortBy=spent"));
  });

  it("muestra el error y se recupera con refresh", async () => {
    top.mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce(ranking);
    const { result } = renderHook(() => useTopCustomers({ period: "month", sortBy: "spent" }));
    await waitFor(() => expect(result.current.status).toBe("error"));
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });
});
