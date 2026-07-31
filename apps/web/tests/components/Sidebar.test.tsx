import type { PublicUser, Wire } from "@gira/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MobileNavProvider, useMobileNav } from "@/components/shell/MobileNavProvider";
import { Sidebar } from "@/components/shell/Sidebar";

const { pathnameState } = vi.hoisted(() => ({ pathnameState: { current: "/resumen" } }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameState.current,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const user: Wire<PublicUser> = {
  id: "1",
  name: "Manuel Arteaga",
  email: "manuel@gira.mx",
  role: "admin" as PublicUser["role"],
  twoFactorEnabled: true,
  isActive: true,
};

/** Mimics what TopBar (Tarea 8) will do — opens the drawer via the shared context. */
const OpenDrawerButton = () => {
  const { openNav } = useMobileNav();
  return (
    <button type="button" onClick={openNav}>
      Abrir
    </button>
  );
};

const renderSidebar = () =>
  render(
    <MobileNavProvider>
      <OpenDrawerButton />
      <Sidebar user={user} />
    </MobileNavProvider>,
  );

describe("Sidebar", () => {
  it("el ítem disponible cuya href coincide con la ruta actual lleva aria-current=page", () => {
    pathnameState.current = "/resumen";
    renderSidebar();

    expect(screen.getByRole("link", { name: "Resumen" })).toHaveAttribute("aria-current", "page");
  });

  it("los ítems no disponibles no son enlaces: llevan aria-disabled y la etiqueta Pronto", () => {
    pathnameState.current = "/resumen";
    renderSidebar();

    expect(screen.queryByRole("link", { name: "Pedidos" })).not.toBeInTheDocument();
    expect(screen.getByText("Pedidos").closest("[aria-disabled]")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getAllByText("Pronto").length).toBeGreaterThan(0);
  });

  it("abrir el drawer marca data-open=true en el aside", async () => {
    pathnameState.current = "/resumen";
    renderSidebar();

    await userEvent.click(screen.getByRole("button", { name: "Abrir" }));

    expect(screen.getByRole("complementary")).toHaveAttribute("data-open", "true");
  });

  it("el botón de cerrar dentro del sidebar cierra el drawer", async () => {
    pathnameState.current = "/resumen";
    renderSidebar();

    await userEvent.click(screen.getByRole("button", { name: "Abrir" }));
    await userEvent.click(screen.getByRole("button", { name: "Cerrar navegación" }));

    expect(screen.getByRole("complementary")).toHaveAttribute("data-open", "false");
  });

  it("el scrim cierra el drawer", async () => {
    pathnameState.current = "/resumen";
    const { container } = renderSidebar();

    await userEvent.click(screen.getByRole("button", { name: "Abrir" }));
    const scrim = container.querySelector('[data-scrim="true"]');
    if (!scrim) throw new Error("scrim no encontrado");
    await userEvent.click(scrim);

    expect(screen.getByRole("complementary")).toHaveAttribute("data-open", "false");
  });

  it("Escape cierra el drawer", async () => {
    pathnameState.current = "/resumen";
    renderSidebar();

    await userEvent.click(screen.getByRole("button", { name: "Abrir" }));
    await userEvent.keyboard("{Escape}");

    expect(screen.getByRole("complementary")).toHaveAttribute("data-open", "false");
  });

  it("cambiar de pathname cierra el drawer", async () => {
    pathnameState.current = "/resumen";
    const { rerender } = renderSidebar();

    await userEvent.click(screen.getByRole("button", { name: "Abrir" }));
    expect(screen.getByRole("complementary")).toHaveAttribute("data-open", "true");

    pathnameState.current = "/otra-ruta";
    rerender(
      <MobileNavProvider>
        <OpenDrawerButton />
        <Sidebar user={user} />
      </MobileNavProvider>,
    );

    expect(screen.getByRole("complementary")).toHaveAttribute("data-open", "false");
  });
});
