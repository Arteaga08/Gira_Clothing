import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatCooldown, useCooldown } from "@/hooks/useCooldown";

describe("formatCooldown", () => {
  it("da m:ss", () => {
    expect(formatCooldown(0)).toBe("0:00");
    expect(formatCooldown(9)).toBe("0:09");
    expect(formatCooldown(59)).toBe("0:59");
    expect(formatCooldown(60)).toBe("1:00");
  });
});

describe("useCooldown", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("arranca inactivo", () => {
    const { result } = renderHook(() => useCooldown(60));
    expect(result.current.active).toBe(false);
    expect(result.current.remaining).toBe(0);
  });

  it("start cuenta hacia atrás cada segundo y se apaga en cero", () => {
    const { result } = renderHook(() => useCooldown(3));
    act(() => result.current.start());
    expect(result.current.remaining).toBe(3);
    expect(result.current.active).toBe(true);
    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current.remaining).toBe(2);
    expect(result.current.label).toBe("0:02");
    // One tick per render: the effect schedules the next second after the state commits.
    act(() => void vi.advanceTimersByTime(1000));
    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current.remaining).toBe(0);
    expect(result.current.active).toBe(false);
  });

  it("volver a llamar start reinicia la cuenta", () => {
    const { result } = renderHook(() => useCooldown(5));
    act(() => result.current.start());
    act(() => void vi.advanceTimersByTime(1000));
    act(() => void vi.advanceTimersByTime(1000));
    act(() => result.current.start());
    expect(result.current.remaining).toBe(5);
  });
});
