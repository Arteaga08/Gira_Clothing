import { act, renderHook } from "@testing-library/react";
import { COUPON_CODE_TAKEN_MESSAGE } from "@gira/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/ApiError";
import { useGiveCoupon } from "@/hooks/useGiveCoupon";
import { EMPTY_GIVE_VALUES } from "@/lib/customers/giveCouponForm";

const giveCoupon = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/adminCustomers", () => ({ customerClient: { giveCoupon } }));

const ID = "68f2ab12c3d4e5f6a7b8caa1";
const values = { ...EMPTY_GIVE_VALUES, code: "gracias-ana", percentOff: "15" };

describe("useGiveCoupon", () => {
  beforeEach(() => {
    giveCoupon.mockReset();
  });

  it("éxito: devuelve emailSent y el código", async () => {
    giveCoupon.mockResolvedValue({ coupon: { code: "GRACIAS-ANA" }, emailSent: true });
    const { result } = renderHook(() => useGiveCoupon());
    let outcome;
    await act(async () => {
      outcome = await result.current.give(ID, values);
    });
    expect(outcome).toEqual({ ok: true, emailSent: true, code: "GRACIAS-ANA" });
    expect(giveCoupon).toHaveBeenCalledWith(ID, expect.objectContaining({ code: "GRACIAS-ANA", percentOff: 15 }));
  });

  it("409 de código duplicado va al campo, no al aviso general", async () => {
    giveCoupon.mockRejectedValue(new ApiError(COUPON_CODE_TAKEN_MESSAGE, "http", 409));
    const { result } = renderHook(() => useGiveCoupon());
    await act(async () => {
      await result.current.give(ID, values);
    });
    expect(result.current.codeError).toBe(COUPON_CODE_TAKEN_MESSAGE);
    expect(result.current.error).toBeNull();
  });

  it("otro error del servidor queda en error", async () => {
    giveCoupon.mockRejectedValue(new ApiError("El cliente no existe.", "http", 404));
    const { result } = renderHook(() => useGiveCoupon());
    await act(async () => {
      await result.current.give(ID, values);
    });
    expect(result.current.error).toBe("El cliente no existe.");
  });

  it("un formulario inválido no toca la red", async () => {
    const { result } = renderHook(() => useGiveCoupon());
    let outcome;
    await act(async () => {
      outcome = await result.current.give(ID, { ...values, code: "" });
    });
    expect(outcome).toEqual({ ok: false });
    expect(giveCoupon).not.toHaveBeenCalled();
  });
});
