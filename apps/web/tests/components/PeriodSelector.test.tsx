import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PeriodSelector } from "@/components/resumen/PeriodSelector";

describe("PeriodSelector", () => {
  it("renderiza Hoy/Semana/Mes + un input de fecha", () => {
    render(<PeriodSelector activePeriod="week" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Hoy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Semana" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mes" })).toBeInTheDocument();
    expect(screen.getByLabelText("Buscar un día específico")).toBeInTheDocument();
  });

  it("aria-pressed marca solo el periodo activo", () => {
    render(<PeriodSelector activePeriod="month" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Mes" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Hoy" })).toHaveAttribute("aria-pressed", "false");
  });

  it("clic en Hoy llama onChange('today') sin fecha", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PeriodSelector activePeriod="week" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Hoy" }));

    expect(onChange).toHaveBeenCalledWith("today");
  });

  it("elegir una fecha llama onChange('custom', fecha)", () => {
    const onChange = vi.fn();
    render(<PeriodSelector activePeriod="week" onChange={onChange} />);

    const input = screen.getByLabelText("Buscar un día específico");
    // jsdom no dispara change con userEvent.type en type=date de forma confiable;
    // se dispara el evento nativo directo, como hacen otras suites del proyecto.
    Object.defineProperty(input, "value", { value: "2026-07-01", writable: true });
    input.dispatchEvent(new Event("change", { bubbles: true }));

    expect(onChange).toHaveBeenCalledWith("custom", "2026-07-01");
  });

  it("ninguno de los tres botones lleva aria-pressed=true cuando el periodo activo es custom", () => {
    render(<PeriodSelector activePeriod="custom" onChange={vi.fn()} />);
    for (const label of ["Hoy", "Semana", "Mes"]) {
      expect(screen.getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "false");
    }
  });
});
