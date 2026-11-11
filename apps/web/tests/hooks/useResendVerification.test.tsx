import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useResendVerification } from "@/hooks/useResendVerification";
import { jsonResponse, stubFetch } from "../helpers/fetchMock";

const ok = jsonResponse(200, { status: "success", message: "ok" });
const body = (fetchMock: ReturnType<typeof stubFetch>) => JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);

describe("useResendVerification", () => {
  it("reenviar conserva el redirect de la compra para que el nuevo enlace también regrese a ella", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok);
    const { result } = renderHook(() => useResendVerification("ana@correo.mx", "/checkout"));
    await act(() => result.current.resend());
    expect(body(fetchMock)).toEqual({ email: "ana@correo.mx", redirect: "/checkout" });
  });

  it("sin redirect manda solo el correo, como antes", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok);
    const { result } = renderHook(() => useResendVerification("ana@correo.mx"));
    await act(() => result.current.resend());
    expect(body(fetchMock)).toEqual({ email: "ana@correo.mx" });
  });
});
