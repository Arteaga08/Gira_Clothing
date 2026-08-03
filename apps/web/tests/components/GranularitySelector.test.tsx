import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GranularitySelector } from "@/components/resumen/GranularitySelector";

describe("GranularitySelector", () => {
  it("renderiza los cuatro enlaces con la vista y el rango default de cada una", () => {
    render(<GranularitySelector activeGranularity="day" />);
    expect(screen.getByRole("link", { name: "Día" })).toHaveAttribute(
      "href",
      "/resumen?dias=30&vista=day",
    );
    expect(screen.getByRole("link", { name: "Semana" })).toHaveAttribute(
      "href",
      "/resumen?dias=90&vista=week",
    );
    expect(screen.getByRole("link", { name: "Mes" })).toHaveAttribute(
      "href",
      "/resumen?dias=365&vista=month",
    );
    expect(screen.getByRole("link", { name: "Año" })).toHaveAttribute(
      "href",
      "/resumen?dias=730&vista=year",
    );
  });

  it("solo la vista activa lleva aria-current=page", () => {
    render(<GranularitySelector activeGranularity="month" />);
    expect(screen.getByRole("link", { name: "Mes" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Día" })).not.toHaveAttribute("aria-current");
  });

  it("el grupo lleva aria-label Vista", () => {
    render(<GranularitySelector activeGranularity="day" />);
    expect(screen.getByRole("group", { name: "Vista" })).toBeInTheDocument();
  });
});
