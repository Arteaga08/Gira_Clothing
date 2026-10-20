import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { SlideOver } from "@/components/ui/SlideOver";

describe("SlideOver", () => {
  it("cerrado no renderiza nada", () => {
    render(<SlideOver open={false} onClose={() => {}} title="Corregir dirección">contenido</SlideOver>);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("abierto es un diálogo modal con título y pie", () => {
    render(
      <SlideOver open onClose={() => {}} title="Corregir dirección" footer={<button>Guardar</button>}>
        contenido
      </SlideOver>,
    );
    const dialog = screen.getByRole("dialog", { name: "Corregir dirección" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
  });

  it("Escape llama onClose", async () => {
    const onClose = vi.fn();
    render(<SlideOver open onClose={onClose} title="Panel">contenido</SlideOver>);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("el botón Cerrar panel llama onClose", async () => {
    const onClose = vi.fn();
    render(<SlideOver open onClose={onClose} title="Panel">contenido</SlideOver>);
    await userEvent.click(screen.getByRole("button", { name: "Cerrar panel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("mueve el foco adentro y lo devuelve al disparador al cerrar", async () => {
    const Harness = () => {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Corregir</button>
          <SlideOver open={open} onClose={() => setOpen(false)} title="Panel">
            <input aria-label="Calle" />
          </SlideOver>
        </>
      );
    };
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Corregir" });
    await userEvent.click(trigger);
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
