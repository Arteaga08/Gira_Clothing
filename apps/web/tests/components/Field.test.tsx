import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Field } from "@/components/ui/Field";

describe("Field", () => {
  it("asocia el label al input", () => {
    render(<Field label="Correo" />);
    expect(screen.getByLabelText("Correo")).toBeInTheDocument();
  });

  it("con error, marca aria-invalid y referencia el mensaje por aria-describedby", () => {
    render(<Field label="Correo" error="Correo inválido" />);
    const input = screen.getByLabelText("Correo");
    expect(input).toHaveAttribute("aria-invalid", "true");
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent("Correo inválido");
  });

  it("sin error, no marca aria-invalid", () => {
    render(<Field label="Correo" />);
    expect(screen.getByLabelText("Correo")).not.toHaveAttribute("aria-invalid");
  });

  it("muestra el texto de ayuda cuando no hay error", () => {
    render(<Field label="Correo" helper="Usa tu correo de la tienda" />);
    expect(screen.getByText("Usa tu correo de la tienda")).toBeInTheDocument();
  });
});
