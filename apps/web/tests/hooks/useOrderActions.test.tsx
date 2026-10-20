import { OrderPriority } from "@gira/shared";
import { act, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/Toast";
import { useOrderActions } from "@/hooks/useOrderActions";
import { ApiError } from "@/lib/api/ApiError";

const api = vi.hoisted(() => ({
  updateOrderStatus: vi.fn(),
  markShipped: vi.fn(),
  requestRefund: vi.fn(),
  retryLabel: vi.fn(),
  updateOrderPriority: vi.fn(),
  updateShippingAddress: vi.fn(),
  bulkMarkProcessing: vi.fn(),
}));
vi.mock("@/lib/api/adminOrders", () => api);

const ORDER = { id: "68f2ab12c3d4e5f6a7b8c9d0", orderNumber: "GC-7KQ3M2XV" };
const wrapper = ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>;

beforeEach(() => Object.values(api).forEach((mock) => mock.mockReset()));

describe("useOrderActions", () => {
  it("prepare pide processing, avisa con el folio y refresca", async () => {
    api.updateOrderStatus.mockResolvedValue({ ...ORDER, status: "processing" });
    const onChanged = vi.fn();
    const { result } = renderHook(() => useOrderActions(onChanged), { wrapper });

    await act(async () => {
      await result.current.prepare(ORDER);
    });

    expect(api.updateOrderStatus).toHaveBeenCalledWith(ORDER.id, "processing");
    expect(screen.getByText("GC-7KQ3M2XV pasó a en proceso")).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("un 409 muestra el mensaje de la API y no refresca", async () => {
    api.markShipped.mockRejectedValue(new ApiError("Primero marca el pedido «en preparación».", "http", 409));
    const onChanged = vi.fn();
    const { result } = renderHook(() => useOrderActions(onChanged), { wrapper });

    let outcome: unknown = "pendiente";
    await act(async () => {
      outcome = await result.current.ship(ORDER);
    });

    expect(outcome).toBeUndefined();
    expect(screen.getByRole("alert")).toHaveTextContent("Primero marca el pedido «en preparación».");
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("los toasts nunca llevan el id interno", async () => {
    api.requestRefund.mockResolvedValue(ORDER);
    const { result } = renderHook(() => useOrderActions(() => {}), { wrapper });
    await act(async () => {
      await result.current.refund(ORDER);
    });
    expect(document.body.textContent).not.toContain(ORDER.id);
    expect(screen.getByText(/cuando Stripe lo confirme/)).toBeInTheDocument();
  });

  it("cancel manda el motivo", async () => {
    api.updateOrderStatus.mockResolvedValue(ORDER);
    const { result } = renderHook(() => useOrderActions(() => {}), { wrapper });
    await act(async () => {
      await result.current.cancel(ORDER, "El cliente lo pidió");
    });
    expect(api.updateOrderStatus).toHaveBeenCalledWith(ORDER.id, "cancelled", "El cliente lo pidió");
  });

  it("setPriority nombra la prioridad en español", async () => {
    api.updateOrderPriority.mockResolvedValue(ORDER);
    const { result } = renderHook(() => useOrderActions(() => {}), { wrapper });
    await act(async () => {
      await result.current.setPriority(ORDER, OrderPriority.URGENT);
    });
    expect(screen.getByText("Prioridad de GC-7KQ3M2XV: urgente")).toBeInTheDocument();
  });

  it("retryLabel devuelve true si la API aceptó el reintento", async () => {
    api.retryLabel.mockResolvedValue("Reintentamos generar la guía.");
    const { result } = renderHook(() => useOrderActions(() => {}), { wrapper });
    let ok = false;
    await act(async () => {
      ok = await result.current.retryLabel(ORDER);
    });
    expect(ok).toBe(true);
  });

  it("isBusy marca la orden mientras corre la acción y se limpia después", async () => {
    let release: (value: unknown) => void = () => {};
    api.markShipped.mockReturnValue(new Promise((resolve) => (release = resolve)));
    const { result } = renderHook(() => useOrderActions(() => {}), { wrapper });
    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.ship(ORDER);
    });
    expect(result.current.isBusy(ORDER.id)).toBe(true);
    expect(result.current.isBusy("otro-id")).toBe(false);
    await act(async () => {
      release(ORDER);
      await pending;
    });
    expect(result.current.isBusy(ORDER.id)).toBe(false);
  });

  it("dos clics seguidos sobre la misma orden llaman a la API una sola vez", async () => {
    let release: (value: unknown) => void = () => {};
    api.markShipped.mockReturnValue(new Promise((resolve) => (release = resolve)));
    const { result } = renderHook(() => useOrderActions(() => {}), { wrapper });
    let first: Promise<unknown> = Promise.resolve();
    let second: unknown = "pendiente";
    act(() => {
      first = result.current.ship(ORDER);
      void result.current.ship(ORDER).then((value) => (second = value));
    });
    await act(async () => {
      release(ORDER);
      await first;
    });
    expect(api.markShipped).toHaveBeenCalledTimes(1);
    expect(second).toBeUndefined();
  });

  it("acciones sobre órdenes distintas no se pisan el estado de ocupado", async () => {
    const releases: ((value: unknown) => void)[] = [];
    api.markShipped.mockImplementation(() => new Promise((resolve) => releases.push(resolve)));
    const other = { id: "bbbbbbbbbbbbbbbbbbbbbbb2", orderNumber: "GC-BBBBBBBB" };
    const { result } = renderHook(() => useOrderActions(() => {}), { wrapper });
    let a: Promise<unknown> = Promise.resolve();
    let b: Promise<unknown> = Promise.resolve();
    act(() => {
      a = result.current.ship(ORDER);
      b = result.current.ship(other);
    });
    expect(result.current.isBusy(ORDER.id)).toBe(true);
    expect(result.current.isBusy(other.id)).toBe(true);
    await act(async () => {
      releases[0]!(ORDER);
      await a;
    });
    expect(result.current.isBusy(ORDER.id)).toBe(false);
    expect(result.current.isBusy(other.id)).toBe(true);
    await act(async () => {
      releases[1]!(other);
      await b;
    });
  });

  it("un lote en curso bloquea todas las órdenes y no deja lanzar otra acción", async () => {
    let release: (value: unknown) => void = () => {};
    api.bulkMarkProcessing.mockReturnValue(new Promise((resolve) => (release = resolve)));
    const { result } = renderHook(() => useOrderActions(() => {}), { wrapper });
    let bulk: Promise<unknown> = Promise.resolve();
    act(() => {
      bulk = result.current.bulkPrepare([ORDER]);
    });
    expect(result.current.isBusy("cualquier-orden")).toBe(true);
    await act(async () => {
      await result.current.prepare(ORDER);
    });
    expect(api.updateOrderStatus).not.toHaveBeenCalled();
    await act(async () => {
      release({ results: [], summary: { updated: 1, unchanged: 0, rejected: 0 } });
      await bulk;
    });
    expect(result.current.isBusy("cualquier-orden")).toBe(false);
  });

  it("bulkPrepare con un rechazado avisa con advertencia y los folios", async () => {
    api.bulkMarkProcessing.mockResolvedValue({
      results: [
        { id: "a", orderNumber: "GC-AAAAAAAA", outcome: "updated" },
        { id: "b", orderNumber: "GC-BBBBBBBB", outcome: "rejected", message: "Ya no está pagado." },
      ],
      summary: { updated: 1, unchanged: 0, rejected: 1 },
    });
    const onChanged = vi.fn();
    const { result } = renderHook(() => useOrderActions(onChanged), { wrapper });
    await act(async () => {
      await result.current.bulkPrepare([ORDER, { id: "x", orderNumber: "GC-XXXXXXXX" }]);
    });
    expect(api.bulkMarkProcessing).toHaveBeenCalledWith([ORDER.id, "x"]);
    expect(screen.getByText("1 en proceso, 0 sin cambio, 1 rechazados")).toBeInTheDocument();
    expect(screen.getByText("GC-BBBBBBBB: Ya no está pagado.")).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
  });
});
