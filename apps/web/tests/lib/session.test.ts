import { UserRole } from "@gira/shared";
import { describe, expect, it, vi } from "vitest";
import { loadSession } from "@/lib/api/session";
import { jsonResponse, networkFailure, stubFetch } from "../helpers/fetchMock";

const { cookiesMock } = vi.hoisted(() => ({ cookiesMock: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: () => cookiesMock() }));

const withSessionCookie = (): void => {
  cookiesMock.mockResolvedValue({
    get: (name: string) => (name === "gira_session" ? { name, value: "abc" } : undefined),
  });
};

const withoutSessionCookie = (): void => {
  cookiesMock.mockResolvedValue({ get: () => undefined });
};

describe("loadSession", () => {
  it("sin cookie devuelve anonymous sin llamar a fetch", async () => {
    withoutSessionCookie();
    const fetchMock = stubFetch();

    const session = await loadSession();

    expect(session).toEqual({ kind: "anonymous" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("con cookie pero 401 del API devuelve anonymous", async () => {
    withSessionCookie();
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { status: "fail", message: "Tu sesión expiró. Inicia sesión de nuevo." }),
    );

    const session = await loadSession();

    expect(session).toEqual({ kind: "anonymous" });
  });

  it("200 con rol admin devuelve authenticated", async () => {
    withSessionCookie();
    const fetchMock = stubFetch();
    const user = {
      id: "1",
      name: "Manuel",
      email: "m@gira.mx",
      role: UserRole.ADMIN,
      twoFactorEnabled: true,
      isActive: true,
    };
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { status: "success", message: "Usuario autenticado.", data: { user } }),
    );

    const session = await loadSession();

    expect(session).toEqual({ kind: "authenticated", user });
  });

  it("una falla de red devuelve unavailable", async () => {
    withSessionCookie();
    const fetchMock = stubFetch();
    fetchMock.mockImplementationOnce(networkFailure);

    const session = await loadSession();

    expect(session.kind).toBe("unavailable");
  });

  it("un 500 del API devuelve unavailable", async () => {
    withSessionCookie();
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { status: "error", message: "Algo falló." }));

    const session = await loadSession();

    expect(session.kind).toBe("unavailable");
  });
});
