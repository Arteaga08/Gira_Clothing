import { UserRole } from "@gira/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AdminLayout from "@/app/(admin)/layout";

// `vi.mock`/`vi.hoisted` are hoisted above every import in this file, so
// everything a factory references — including the sentinel class — has to
// be produced inside `vi.hoisted`, self-contained.
const { loadSessionMock, RedirectSentinel } = vi.hoisted(() => {
  class RedirectSentinel extends Error {
    constructor(public url: string) {
      super(`redirect:${url}`);
    }
  }
  return { loadSessionMock: vi.fn(), RedirectSentinel };
});

vi.mock("@/lib/api/session", () => ({ loadSession: loadSessionMock }));
vi.mock("next/navigation", () => ({
  // ForbiddenScreen renders LogoutButton (useRouter) and an authenticated
  // admin renders the full AdminShell, which renders Sidebar (usePathname)
  // — this mock has to cover every next/navigation export the tree touches.
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/resumen",
  redirect: (url: string): never => {
    throw new RedirectSentinel(url);
  },
}));

describe("AdminLayout", () => {
  it("anonymous: redirige a /login", async () => {
    loadSessionMock.mockResolvedValue({ kind: "anonymous" });

    const error = await AdminLayout({ children: <div>hijo</div> }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(RedirectSentinel);
    expect((error as InstanceType<typeof RedirectSentinel>).url).toBe("/login");
  });

  it("customer autenticado: muestra la pantalla de sin permiso, sin redirigir", async () => {
    loadSessionMock.mockResolvedValue({
      kind: "authenticated",
      user: {
        id: "1",
        name: "Cliente",
        email: "c@gira.mx",
        role: UserRole.CUSTOMER,
        twoFactorEnabled: false,
        isActive: true,
      },
    });

    const element = await AdminLayout({ children: <div>hijo</div> });
    render(element);

    expect(screen.getByText(/no tiene acceso al panel/i)).toBeInTheDocument();
    expect(screen.queryByText("hijo")).not.toBeInTheDocument();
  });

  it("sesión no disponible: muestra la pantalla de error, sin redirigir", async () => {
    loadSessionMock.mockResolvedValue({
      kind: "unavailable",
      message: "No se pudo conectar con el servidor.",
    });

    const element = await AdminLayout({ children: <div>hijo</div> });
    render(element);

    expect(screen.getByText(/no pudimos verificar tu sesión/i)).toBeInTheDocument();
  });

  it("admin autenticado: renderiza el shell con el contenido hijo", async () => {
    loadSessionMock.mockResolvedValue({
      kind: "authenticated",
      user: {
        id: "1",
        name: "Manuel",
        email: "m@gira.mx",
        role: UserRole.ADMIN,
        twoFactorEnabled: true,
        isActive: true,
      },
    });

    const element = await AdminLayout({ children: <div>hijo</div> });
    render(element);

    expect(screen.getByText("hijo")).toBeInTheDocument();
  });
});
