import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RetirePrintSection } from "@/components/prints/RetirePrintSection";
import { makePanelPrint, MODEL_ID, PRINT_ID } from "../../helpers/prints";

const setup = (print = makePanelPrint(), overrides = {}) => {
  const props = { print, error: null, onRetire: vi.fn().mockResolvedValue(true), onReactivate: vi.fn().mockResolvedValue(true), ...overrides };
  render(<RetirePrintSection {...props} />);
  return props;
};

describe("RetirePrintSection", () => {
  it("con variantes activas bloquea, explica y enlaza a modelos e Inventario", () => {
    setup(makePanelPrint({ activeVariantCount: 6 }));
    expect(screen.getByRole("button", { name: "Retirar estampa" })).toBeDisabled();
    expect(screen.getByText(/6 variantes activas/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Cosmetiquera chica/ })).toHaveAttribute("href", `/productos/${MODEL_ID}`);
    expect(screen.getByRole("link", { name: /Ver las 6 variantes en Inventario/ })).toHaveAttribute(
      "href",
      `/inventario?print=${PRINT_ID}`,
    );
  });

  it("dice cuántos modelos faltan cuando la lista está recortada", () => {
    setup(makePanelPrint({ activeVariantCount: 12 }));
    expect(screen.getByText("y 11 más")).toBeInTheDocument();
  });

  it("con una sola variante usa el singular", () => {
    setup(makePanelPrint({ activeVariantCount: 1 }));
    expect(screen.getByText(/1 variante activa/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ver la variante en Inventario/ })).toBeInTheDocument();
  });

  it("sin variantes pide confirmación antes de retirar", async () => {
    const props = setup(makePanelPrint({ activeVariantCount: 0, activeProducts: [] }));
    await userEvent.click(screen.getByRole("button", { name: "Retirar estampa" }));
    const dialog = screen.getByRole("dialog");
    expect(props.onRetire).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Retirar estampa" }));
    expect(props.onRetire).toHaveBeenCalledTimes(1);
  });

  it("una estampa retirada se puede reactivar", async () => {
    const props = setup(makePanelPrint({ isActive: false, activeVariantCount: 0, activeProducts: [] }));
    await userEvent.click(screen.getByRole("button", { name: "Reactivar estampa" }));
    expect(props.onReactivate).toHaveBeenCalled();
  });

  it("muestra el error del API junto al botón", () => {
    setup(makePanelPrint({ isActive: false, activeVariantCount: 0 }), { error: "No puedes reactivar este estampado: su familia está retirada." });
    expect(screen.getByRole("alert")).toHaveTextContent("su familia está retirada");
  });
});
