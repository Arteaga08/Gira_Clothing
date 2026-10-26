import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CategoryColorField } from "@/components/ui/CategoryColorField";
import { StoreCardSection } from "@/components/catalog/StoreCardSection";
import { EMPTY_MODEL } from "@/lib/catalog/productForm";
import { chooseOption } from "../../helpers/select";

const PRINTS = [
  { id: "a1", name: "Nopal", sku: "FLO-NOPAL", familyId: "f", familyName: "Flores", imageUrl: "x" },
  { id: "b2", name: "Jacaranda", sku: "FLO-JAC", familyId: "f", familyName: "Flores", imageUrl: "y" },
];

describe("StoreCardSection", () => {
  const setup = (patch: Partial<typeof EMPTY_MODEL> = {}, prints = PRINTS) => {
    const onChange = vi.fn();
    render(
      <StoreCardSection
        model={{ ...EMPTY_MODEL, ...patch }}
        errors={{}}
        selectedPrints={prints}
        categoryName="Playeras"
        categoryColor="ikat"
        onChange={onChange}
      />,
    );
    return onChange;
  };

  it("el interruptor marca el modelo como más vendido", async () => {
    const onChange = setup();
    await userEvent.click(screen.getByRole("switch", { name: /Más vendido/ }));
    expect(onChange).toHaveBeenCalledWith({ bestSeller: true });
  });

  it("el interruptor marca el modelo como novedad", async () => {
    const onChange = setup();
    await userEvent.click(screen.getByRole("switch", { name: /Novedad/ }));
    expect(onChange).toHaveBeenCalledWith({ newArrival: true });
  });

  it("escribir una palabra cambia solo esa posición", async () => {
    const onChange = setup({ cardTags: ["Fresca", "", ""] });
    await userEvent.type(screen.getByLabelText("Palabra 2"), "S");
    expect(onChange).toHaveBeenLastCalledWith({ cardTags: ["Fresca", "S", ""] });
  });

  it("la variante de la card se elige entre las estampas del modelo", async () => {
    const onChange = setup();
    await chooseOption(screen.getByRole("combobox", { name: /Variante de la card/ }), "Jacaranda");
    expect(onChange).toHaveBeenCalledWith({ cardPrintId: "b2" });
  });

  it("sin estampas elegidas no deja escoger y lo explica", () => {
    setup({}, []);
    expect(screen.getByRole("combobox", { name: /Variante de la card/ })).toBeDisabled();
    expect(screen.getByText("Elige primero las estampas del modelo.")).toBeInTheDocument();
  });

  it("dice qué color tomará la card: el de la categoría", () => {
    setup();
    expect(screen.getByText(/Color de la card: Azul ikat, el de la categoría «Playeras»/)).toBeInTheDocument();
  });
});

describe("CategoryColorField", () => {
  it("elige un color y lo marca como seleccionado", async () => {
    const onChange = vi.fn();
    render(<CategoryColorField name="c" legend="Color en la tienda" value="bone" onChange={onChange} />);
    expect(screen.getByRole("radio", { name: "Hueso" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "Mandarina" }));
    expect(onChange).toHaveBeenCalledWith("tangerine");
  });

  it("ofrece los 8 colores y ninguno amarillo", () => {
    render(<CategoryColorField name="c" legend="Color en la tienda" value="pink" onChange={() => undefined} />);
    expect(screen.getAllByRole("radio")).toHaveLength(8);
    expect(screen.queryByRole("radio", { name: /amarillo/i })).not.toBeInTheDocument();
  });
});
