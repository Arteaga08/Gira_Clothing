import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Segmented } from "@/components/ui/Segmented";

describe("Segmented", () => {
  it("con href, renderiza un link con aria-current cuando está seleccionado", () => {
    render(
      <Segmented href="/resumen?dias=30" selected>
        30 días
      </Segmented>,
    );
    const link = screen.getByRole("link", { name: "30 días" });
    expect(link).toHaveAttribute("href", "/resumen?dias=30");
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("con href, no seleccionado no lleva aria-current", () => {
    render(
      <Segmented href="/resumen?dias=7" selected={false}>
        7 días
      </Segmented>,
    );
    expect(screen.getByRole("link", { name: "7 días" })).not.toHaveAttribute("aria-current");
  });

  it("con onClick, renderiza un botón con aria-pressed reflejando selected", () => {
    render(
      <Segmented selected onClick={vi.fn()}>
        Pedidos
      </Segmented>,
    );
    expect(screen.getByRole("button", { name: "Pedidos" })).toHaveAttribute("aria-pressed", "true");
  });

  it("onClick se dispara al hacer click en el botón", async () => {
    const onClick = vi.fn();
    render(
      <Segmented selected={false} onClick={onClick}>
        Ingresos
      </Segmented>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Ingresos" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("disabled deshabilita el botón", () => {
    render(
      <Segmented selected={false} onClick={vi.fn()} disabled>
        Unidades
      </Segmented>,
    );
    expect(screen.getByRole("button", { name: "Unidades" })).toBeDisabled();
  });
});
