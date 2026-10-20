import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SelectField } from "@/components/ui/SelectField";

const OPTIONS = [
  { value: "", label: "Todos" },
  { value: "a", label: "Opción A" },
];

describe("SelectField", () => {
  it("asocia la etiqueta con el select y lista las opciones", () => {
    render(<SelectField label="Estado" options={OPTIONS} defaultValue="" />);
    expect(screen.getByLabelText("Estado")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Opción A" })).toBeInTheDocument();
  });

  it("quita la flecha nativa y deja espacio a la derecha para la propia", () => {
    render(<SelectField label="Estado" options={OPTIONS} defaultValue="" />);
    const select = screen.getByLabelText("Estado");
    expect(select.className).toContain("appearance-none");
    expect(select.className).toContain("pr-10");
  });

  it("la flecha propia es decorativa y no intercepta el clic", () => {
    const { container } = render(<SelectField label="Estado" options={OPTIONS} defaultValue="" />);
    const arrow = container.querySelector("svg");
    expect(arrow).toHaveAttribute("aria-hidden", "true");
    expect(arrow?.getAttribute("class")).toContain("pointer-events-none");
  });

  it("sigue avisando del cambio", async () => {
    const onChange = vi.fn();
    render(<SelectField label="Estado" options={OPTIONS} defaultValue="" onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText("Estado"), "a");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("muestra el error y lo enlaza con aria-describedby", () => {
    render(<SelectField label="Estado" options={OPTIONS} error="Elige uno" defaultValue="" />);
    const select = screen.getByLabelText("Estado");
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Elige uno")).toHaveAttribute("id", select.getAttribute("aria-describedby"));
  });
});
