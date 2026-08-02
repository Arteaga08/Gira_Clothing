import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RangeSelector } from "@/components/resumen/RangeSelector";

describe("RangeSelector", () => {
  it("renderiza los tres enlaces con su href", () => {
    render(<RangeSelector activeDays={30} />);
    expect(screen.getByRole("link", { name: "7 d" })).toHaveAttribute("href", "/resumen?dias=7");
    expect(screen.getByRole("link", { name: "30 d" })).toHaveAttribute("href", "/resumen?dias=30");
    expect(screen.getByRole("link", { name: "90 d" })).toHaveAttribute("href", "/resumen?dias=90");
  });

  it("solo el activo lleva aria-current=page", () => {
    render(<RangeSelector activeDays={7} />);
    expect(screen.getByRole("link", { name: "7 d" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "30 d" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "90 d" })).not.toHaveAttribute("aria-current");
  });

  it("el grupo lleva aria-label", () => {
    render(<RangeSelector activeDays={30} />);
    expect(screen.getByRole("group", { name: "Rango del periodo" })).toBeInTheDocument();
  });
});
