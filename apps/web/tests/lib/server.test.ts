import { describe, expect, it, vi } from "vitest";
import { serverRequest } from "@/lib/api/server";
import { jsonResponse, stubFetch } from "../helpers/fetchMock";

const { cookiesMock } = vi.hoisted(() => ({ cookiesMock: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: () => cookiesMock() }));

describe("serverRequest", () => {
  it("reenvía la cookie de sesión a mano y fuerza cache: no-store", async () => {
    cookiesMock.mockResolvedValue({
      get: (name: string) => (name === "gira_session" ? { name, value: "abc" } : undefined),
    });
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { status: "success", message: "ok" }));

    await serverRequest("/auth/me");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).cookie).toBe("gira_session=abc");
    expect(init.cache).toBe("no-store");
  });

  it("sin cookie de sesión no manda el header cookie", async () => {
    cookiesMock.mockResolvedValue({ get: () => undefined });
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { status: "success", message: "ok" }));

    await serverRequest("/auth/me");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).cookie).toBeUndefined();
  });
});
