import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { CommandPaletteProvider, useCommandPalette } from "@/components/shell/CommandPaletteProvider";

const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

beforeEach(() => {
  router.push.mockClear();
  router.replace.mockClear();
  router.refresh.mockClear();
});

const OpenTrigger = () => {
  const { openPalette } = useCommandPalette();
  return (
    <button type="button" onClick={openPalette}>
      Abrir paleta
    </button>
  );
};

const renderPalette = () =>
  render(
    <CommandPaletteProvider>
      <OpenTrigger />
      <CommandPalette />
    </CommandPaletteProvider>,
  );

describe("CommandPalette", () => {
  it("se abre con el disparador y Escape cierra devolviendo el foco", async () => {
    renderPalette();
    const trigger = screen.getByRole("button", { name: "Abrir paleta" });

    await userEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("filtra por texto sin distinguir acentos", async () => {
    renderPalette();
    await userEvent.click(screen.getByRole("button", { name: "Abrir paleta" }));

    await userEvent.type(screen.getByRole("combobox"), "envios");

    expect(screen.getByRole("option", { name: /envíos/i })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Resumen" })).not.toBeInTheDocument();
  });

  it("ArrowDown selecciona el primer ítem disponible y salta los deshabilitados al repetir", async () => {
    renderPalette();
    await userEvent.click(screen.getByRole("button", { name: "Abrir paleta" }));

    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: "Resumen" })).toHaveAttribute("aria-selected", "true");

    // Solo "Resumen" está disponible en M7 — repetir ArrowDown da la vuelta y
    // vuelve a él, lo que prueba que los deshabilitados de en medio se saltaron.
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: "Resumen" })).toHaveAttribute("aria-selected", "true");
  });

  it("Enter sobre el ítem seleccionado navega y cierra", async () => {
    renderPalette();
    await userEvent.click(screen.getByRole("button", { name: "Abrir paleta" }));

    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(router.push).toHaveBeenCalledWith("/resumen");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("un ítem no disponible no se puede activar con clic", async () => {
    renderPalette();
    await userEvent.click(screen.getByRole("button", { name: "Abrir paleta" }));

    await userEvent.click(screen.getByRole("option", { name: /pedidos/i }));

    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("sin coincidencias muestra Sin resultados y ninguna opción", async () => {
    renderPalette();
    await userEvent.click(screen.getByRole("button", { name: "Abrir paleta" }));

    await userEvent.type(screen.getByRole("combobox"), "xyzxyz");

    expect(screen.getByText("Sin resultados")).toBeInTheDocument();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });
});
