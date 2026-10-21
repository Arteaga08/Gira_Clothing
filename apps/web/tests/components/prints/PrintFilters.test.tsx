import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PrintFilters } from "@/components/prints/PrintFilters";
import type { PrintFilters as Filters } from "@/lib/prints/filters";
import { chooseOption } from "../../helpers/select";
import { FAMILY_A_ID, FAMILY_B_ID } from "../../helpers/prints";

const FILTERS: Filters = { status: "active", sort: "name", page: 1 };
const FAMILIES = [
  { value: FAMILY_A_ID, label: "Florales" },
  { value: FAMILY_B_ID, label: "Geométricas" },
];

const setup = (filters: Filters = FILTERS) => {
  const onChange = vi.fn();
  render(<PrintFilters filters={filters} families={FAMILIES} onChange={onChange} />);
  return onChange;
};

describe("PrintFilters", () => {
  it("la búsqueda espera 300 ms tras escribir", async () => {
    const onChange = setup();
    await userEvent.type(screen.getByLabelText("Buscar"), "rosa");
    expect(onChange).not.toHaveBeenCalled();
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ search: "rosa" }));
  });

  it("filtra por familia y «Todas» la quita", async () => {
    const onChange = setup({ ...FILTERS, family: FAMILY_A_ID });
    expect(screen.getByRole("combobox", { name: "Familia" })).toHaveTextContent("Florales");
    await chooseOption(screen.getByRole("combobox", { name: "Familia" }), "Todas");
    expect(onChange).toHaveBeenCalledWith({ family: undefined });
  });

  it("una familia que ya no está en la lista activa se sigue viendo, no se disfraza de «Todas»", () => {
    setup({ ...FILTERS, family: "68f2ab12c3d4e5f6a7b8c9ee" });
    expect(screen.getByRole("combobox", { name: "Familia" })).toHaveTextContent("Familia retirada");
  });

  it("cambia el estado con el segmentado", async () => {
    const onChange = setup();
    expect(screen.getByRole("button", { name: "Activas" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Retiradas" }));
    expect(onChange).toHaveBeenCalledWith({ status: "retired" });
  });

  it("cambia el orden", async () => {
    const onChange = setup();
    await chooseOption(screen.getByRole("combobox", { name: "Ordenar por" }), "SKU");
    expect(onChange).toHaveBeenCalledWith({ sort: "sku" });
  });
});
