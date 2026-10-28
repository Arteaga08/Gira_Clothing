import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadSessionMock, redirectMock } = vi.hoisted(() => ({
  loadSessionMock: vi.fn(),
  redirectMock: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));

vi.mock("@/lib/api/session", () => ({ loadSession: loadSessionMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import { requireCustomer } from "@/lib/account/requireCustomer";

const user = (role: "customer" | "admin") => ({ kind: "authenticated", user: { id: "1", role, firstName: "María" } });

describe("requireCustomer", () => {
  beforeEach(() => {
    loadSessionMock.mockReset();
    redirectMock.mockClear();
  });

  it("anónimo: va a /ingresar con ?redirect= a la página que pidió", async () => {
    loadSessionMock.mockResolvedValue({ kind: "anonymous" });
    await expect(requireCustomer("/cuenta/pedidos")).rejects.toThrow("REDIRECT:/ingresar?redirect=%2Fcuenta%2Fpedidos");
  });

  it("anónimo en /cuenta: el destino por defecto no se repite en la URL", async () => {
    loadSessionMock.mockResolvedValue({ kind: "anonymous" });
    await expect(requireCustomer("/cuenta")).rejects.toThrow("REDIRECT:/ingresar");
  });

  it("admin: va al panel", async () => {
    loadSessionMock.mockResolvedValue(user("admin"));
    await expect(requireCustomer("/cuenta")).rejects.toThrow("REDIRECT:/resumen");
  });

  it("unavailable: no redirige, devuelve el estado", async () => {
    loadSessionMock.mockResolvedValue({ kind: "unavailable", message: "API caída" });
    await expect(requireCustomer("/cuenta")).resolves.toEqual({ kind: "unavailable", message: "API caída" });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("cliente: devuelve al usuario", async () => {
    loadSessionMock.mockResolvedValue(user("customer"));
    const guard = await requireCustomer("/cuenta");
    expect(guard).toMatchObject({ kind: "customer", user: { firstName: "María" } });
  });
});
