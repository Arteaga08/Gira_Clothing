import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PrintPicker } from "@/components/catalog/PrintPicker";
import type { PickerPrint } from "@/lib/catalog/catalogOptions";

const print = (id: string, name: string, familyId: string, familyName: string): PickerPrint => ({
  id,
  name,
  sku: name.slice(0, 3).toUpperCase(),
  familyId,
  familyName,
  imageUrl: `https://res.cloudinary.com/gira/${id}.jpg`,
});

const PRINTS = [
  print("p1", "Nopal en flor", "f1", "Flora"),
  print("p2", "Monarca", "f1", "Flora"),
  print("p3", "Cassette", "f2", "Retro"),
];

const renderPicker = (overrides: Partial<React.ComponentProps<typeof PrintPicker>> = {}) => {
  const props = {
    prints: PRINTS,
    selectedIds: new Set<string>(),
    lockedIds: new Set<string>(),
    retiredIds: new Set<string>(),
    onToggle: vi.fn(),
    onCreate: vi.fn(),
    ...overrides,
  };
  render(<PrintPicker {...props} />);
  return props;
};

describe("PrintPicker", () => {
  it("muestra todas las estampas en una sola cuadrícula", () => {
    renderPicker();
    expect(screen.getByRole("button", { name: /Nopal en flor/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cassette/ })).toBeInTheDocument();
  });

  it("el filtro de familia deja solo las de esa familia y «Todas» las devuelve", async () => {
    renderPicker();
    const filter = screen.getByRole("group", { name: "Filtrar por familia" });
    await userEvent.click(within(filter).getByRole("button", { name: "Retro" }));
    expect(screen.queryByRole("button", { name: /Nopal en flor/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cassette/ })).toBeInTheDocument();
    await userEvent.click(within(filter).getByRole("button", { name: "Todas" }));
    expect(screen.getByRole("button", { name: /Nopal en flor/ })).toBeInTheDocument();
  });

  it("marca las elegidas con aria-pressed y avisa al elegir o quitar", async () => {
    const { onToggle } = renderPicker({ selectedIds: new Set(["p1"]) });
    expect(screen.getByRole("button", { name: /Nopal en flor/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Monarca/ })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(screen.getByRole("button", { name: /Monarca/ }));
    expect(onToggle).toHaveBeenCalledWith("p2");
  });

  it("una estampa con apartados no se puede quitar y lo dice", () => {
    renderPicker({ selectedIds: new Set(["p1"]), lockedIds: new Set(["p1"]) });
    const tile = screen.getByRole("button", { name: /Nopal en flor/ });
    expect(tile).toBeDisabled();
    expect(within(tile).getByText("Con apartados")).toBeInTheDocument();
  });

  it("una estampa con variante retirada se puede volver a elegir y se marca como retirada", () => {
    renderPicker({ retiredIds: new Set(["p2"]) });
    const tile = screen.getByRole("button", { name: /Monarca/ });
    expect(tile).toBeEnabled();
    expect(within(tile).getByText("Retirada")).toBeInTheDocument();
  });

  it("«Nueva estampa» pide crearla", async () => {
    const { onCreate } = renderPicker();
    await userEvent.click(screen.getByRole("button", { name: /Nueva estampa/ }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});
