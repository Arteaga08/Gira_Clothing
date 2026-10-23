import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { CommandPaletteProvider, useCommandPalette } from "@/components/shell/CommandPaletteProvider";

const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

// Every screen has landed (M12c), so one item is marked unavailable here to keep the «Pronto» path covered.
vi.mock("@/lib/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/navigation")>();
  const pending = (item: (typeof actual.NAV_ITEMS)[number]) =>
    item.key === "auditLog" ? { ...item, available: false } : item;
  const NAV_GROUPS = actual.NAV_GROUPS.map((group) => ({ ...group, items: group.items.map(pending) }));
  return { ...actual, NAV_GROUPS, NAV_ITEMS: NAV_GROUPS.flatMap((group) => group.items) };
});

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

  it("buscar envíos encuentra Pedidos: ahí vive la logística", async () => {
    renderPalette();
    await userEvent.click(screen.getByRole("button", { name: "Abrir paleta" }));
    await userEvent.type(screen.getByRole("combobox"), "envios");
    expect(screen.getByRole("option", { name: "Pedidos" })).toBeInTheDocument();
  });

  it("filtra por texto sin distinguir acentos", async () => {
    renderPalette();
    await userEvent.click(screen.getByRole("button", { name: "Abrir paleta" }));

    await userEvent.type(screen.getByRole("combobox"), "categorias");

    expect(screen.getByRole("option", { name: /categorías/i })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Resumen" })).not.toBeInTheDocument();
  });

  it("ArrowDown selecciona el primer ítem disponible y salta los deshabilitados al repetir", async () => {
    renderPalette();
    await userEvent.click(screen.getByRole("button", { name: "Abrir paleta" }));

    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: "Resumen" })).toHaveAttribute("aria-selected", "true");

    // Hay once ítems disponibles (todos menos Auditoría, marcada «Pronto» arriba): las flechas los
    // recorren sin pisar nunca el deshabilitado y la undécima da la vuelta a Resumen.
    const visited = ["Resumen"];
    for (let step = 0; step < 10; step += 1) {
      await userEvent.keyboard("{ArrowDown}");
      const selected = screen.getAllByRole("option").find((option) => option.getAttribute("aria-selected") === "true");
      expect(selected).toBeDefined();
      expect(selected).not.toHaveAttribute("aria-disabled", "true");
      visited.push(selected?.textContent ?? "");
    }
    expect(new Set(visited).size).toBe(11);
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

    await userEvent.click(screen.getByRole("option", { name: /auditoría/i }));

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
