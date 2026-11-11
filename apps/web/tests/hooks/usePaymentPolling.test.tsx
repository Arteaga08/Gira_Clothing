import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { OrderStatus } from "@gira/shared";
import { usePaymentPolling } from "@/hooks/usePaymentPolling";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const PUBLIC_ID = "p".repeat(43);

beforeEach(() => {
  vi.useFakeTimers();
  refresh.mockReset();
});
afterEach(() => vi.useRealTimers());

const tick = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

describe("usePaymentPolling", () => {
  it("consulta cada 3 segundos y no hace nada antes", async () => {
    const fetchStatus = vi.fn().mockResolvedValue(OrderStatus.PENDING_PAYMENT);
    renderHook(() => usePaymentPolling({ publicId: PUBLIC_ID, fetchStatus }));
    await tick(2_999);
    expect(fetchStatus).not.toHaveBeenCalled();
    await tick(1);
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    expect(fetchStatus).toHaveBeenCalledWith(PUBLIC_ID);
    await tick(3_000);
    expect(fetchStatus).toHaveBeenCalledTimes(2);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("cuando el estado cambia refresca la página una vez y deja de consultar", async () => {
    const fetchStatus = vi
      .fn()
      .mockResolvedValueOnce(OrderStatus.PENDING_PAYMENT)
      .mockResolvedValueOnce(OrderStatus.PAID);
    renderHook(() => usePaymentPolling({ publicId: PUBLIC_ID, fetchStatus }));
    await tick(3_000);
    await tick(3_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    await tick(30_000);
    expect(fetchStatus).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("tras 10 intentos sigue pendiente: refresca una última vez y marca tiempo agotado", async () => {
    const fetchStatus = vi.fn().mockResolvedValue(OrderStatus.PENDING_PAYMENT);
    const { result } = renderHook(() => usePaymentPolling({ publicId: PUBLIC_ID, fetchStatus }));
    expect(result.current).toBe("polling");
    await tick(3_000 * 10);
    expect(fetchStatus).toHaveBeenCalledTimes(10);
    expect(result.current).toBe("timed-out");
    expect(refresh).toHaveBeenCalledTimes(1);
    await tick(30_000);
    expect(fetchStatus).toHaveBeenCalledTimes(10);
  });

  it("un fallo de red no detiene el sondeo", async () => {
    const fetchStatus = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(OrderStatus.CANCELLED);
    renderHook(() => usePaymentPolling({ publicId: PUBLIC_ID, fetchStatus }));
    await tick(3_000);
    expect(refresh).not.toHaveBeenCalled();
    await tick(3_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("al desmontar cancela el temporizador: no consulta ni refresca después", async () => {
    const fetchStatus = vi.fn().mockResolvedValue(OrderStatus.PENDING_PAYMENT);
    const { unmount } = renderHook(() => usePaymentPolling({ publicId: PUBLIC_ID, fetchStatus }));
    await tick(3_000);
    unmount();
    await tick(60_000);
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("nunca decide que el pedido está pagado: solo refresca y deja que el servidor lo diga", async () => {
    const fetchStatus = vi.fn().mockResolvedValue(OrderStatus.PAID);
    const { result } = renderHook(() => usePaymentPolling({ publicId: PUBLIC_ID, fetchStatus }));
    await tick(3_000);
    expect(result.current).toBe("polling");
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
