import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CommandPaletteProvider, useCommandPalette } from "@/components/shell/CommandPaletteProvider";
import { MobileNavProvider } from "@/components/shell/MobileNavProvider";
import { TopBar } from "@/components/shell/TopBar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/resumen",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

// The bell polls /admin/notifications/health on mount (Tarea 7) — TopBar's
// own tests aren't about that data, so it's stubbed to never resolve rather
// than left to hit the real fetch.
vi.mock("@/lib/api/outbox", () => ({ fetchOutboxHealth: () => new Promise(() => {}) }));

/** Exposes the shared context state so the test can assert on it directly. */
const PaletteStateProbe = () => {
  const { open } = useCommandPalette();
  return <p>{open ? "Paleta abierta" : "Paleta cerrada"}</p>;
};

const renderTopBar = () =>
  render(
    <MobileNavProvider>
      <CommandPaletteProvider>
        <TopBar />
        <PaletteStateProbe />
      </CommandPaletteProvider>
    </MobileNavProvider>,
  );

describe("TopBar", () => {
  it("el botón de búsqueda abre la paleta — el mismo estado que abriría ⌘K", async () => {
    renderTopBar();
    expect(screen.getByText("Paleta cerrada")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /buscar/i }));

    expect(screen.getByText("Paleta abierta")).toBeInTheDocument();
  });

  it("la hamburguesa refleja aria-expanded según el estado del drawer", async () => {
    renderTopBar();
    const hamburger = screen.getByRole("button", { name: "Abrir navegación" });
    expect(hamburger).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(hamburger);

    expect(hamburger).toHaveAttribute("aria-expanded", "true");
  });
});
