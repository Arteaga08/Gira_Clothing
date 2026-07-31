import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("test harness", () => {
  it("renderiza y consulta el DOM", () => {
    render(<button type="button">Hola</button>);
    expect(screen.getByRole("button", { name: "Hola" })).toBeInTheDocument();
  });
});
