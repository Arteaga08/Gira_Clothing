import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOutboxHealth } from "@/hooks/useOutboxHealth";

const flush = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

const { fetchOutboxHealthMock } = vi.hoisted(() => ({ fetchOutboxHealthMock: vi.fn() }));
vi.mock("@/lib/api/outbox", () => ({ fetchOutboxHealth: fetchOutboxHealthMock }));

const HEALTHY = {
  pending: 3,
  sending: 0,
  failed: 0,
  sent: 0,
  stale: 0,
  oldestPendingAt: null,
  failedSample: [],
};

const Harness = () => {
  const health = useOutboxHealth();
  return <p>{health ? `pending:${health.pending}` : "sin datos"}</p>;
};

const setVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
};

describe("useOutboxHealth", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility("visible");
    fetchOutboxHealthMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("pide una vez al montar", async () => {
    fetchOutboxHealthMock.mockResolvedValue(HEALTHY);
    render(<Harness />);
    await flush(0);

    expect(fetchOutboxHealthMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("pending:3")).toBeInTheDocument();
  });

  it("vuelve a pedir a los 60s", async () => {
    fetchOutboxHealthMock.mockResolvedValue(HEALTHY);
    render(<Harness />);
    await flush(0);
    expect(fetchOutboxHealthMock).toHaveBeenCalledTimes(1);

    await flush(60_000);

    expect(fetchOutboxHealthMock).toHaveBeenCalledTimes(2);
  });

  it("con la pestaña oculta, no vuelve a pedir", async () => {
    fetchOutboxHealthMock.mockResolvedValue(HEALTHY);
    render(<Harness />);
    await flush(0);
    expect(fetchOutboxHealthMock).toHaveBeenCalledTimes(1);

    setVisibility("hidden");
    await flush(60_000);

    expect(fetchOutboxHealthMock).toHaveBeenCalledTimes(1);
  });

  it("al desmontar, limpia el intervalo — un fetch en vuelo no hace setState", async () => {
    fetchOutboxHealthMock.mockResolvedValue(HEALTHY);
    const { unmount } = render(<Harness />);
    await flush(0);
    expect(fetchOutboxHealthMock).toHaveBeenCalledTimes(1);

    unmount();
    await flush(120_000);

    expect(fetchOutboxHealthMock).toHaveBeenCalledTimes(1);
  });

  it("un rechazo deja health en null y no lanza", async () => {
    fetchOutboxHealthMock.mockRejectedValue(new Error("red caída"));
    render(<Harness />);
    await flush(0);

    expect(fetchOutboxHealthMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("sin datos")).toBeInTheDocument();
  });
});
