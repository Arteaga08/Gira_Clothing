import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/Button";

describe("Button", () => {
  it("loading deshabilita el botón y marca aria-busy", () => {
    render(<Button loading>Guardar</Button>);
    const button = screen.getByRole("button", { name: "Guardar" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("disabled no dispara onClick", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Guardar
      </Button>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("onClick se dispara en estado normal", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Guardar</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("variant danger conserva el borde ink del tratamiento", () => {
    render(<Button variant="danger">Eliminar</Button>);
    const button = screen.getByRole("button", { name: "Eliminar" });
    expect(button.className).toMatch(/\bborder-ink\b/);
    expect(button.className).toMatch(/\bborder-2\b/);
  });

  it("por defecto es type=button (no envía formularios sin querer)", () => {
    render(<Button>Cancelar</Button>);
    expect(screen.getByRole("button", { name: "Cancelar" })).toHaveAttribute("type", "button");
  });
});
