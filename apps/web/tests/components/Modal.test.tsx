import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";

describe("Modal", () => {
  it("cerrado no renderiza nada", () => {
    render(<Modal open={false} onClose={() => {}} title="Florales">contenido</Modal>);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("abierto es un diálogo modal con título y pie", () => {
    render(
      <Modal open onClose={() => {}} title="Florales" footer={<button>Guardar</button>}>
        contenido
      </Modal>,
    );
    expect(screen.getByRole("dialog", { name: "Florales" })).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
  });

  it("sin pie no dibuja la barra de acciones", () => {
    render(<Modal open onClose={() => {}} title="Florales">contenido</Modal>);
    expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
  });

  it("Escape, el botón Cerrar y el velo llaman onClose", async () => {
    const onClose = vi.fn();
    const { baseElement } = render(<Modal open onClose={onClose} title="Florales">contenido</Modal>);
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    await userEvent.click(baseElement.querySelector('[aria-hidden="true"].fixed') as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("mueve el foco adentro y lo devuelve al disparador al cerrar", async () => {
    const Harness = () => {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Abrir</button>
          <Modal open={open} onClose={() => setOpen(false)} title="Florales">
            <input aria-label="Nombre" />
          </Modal>
        </>
      );
    };
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Abrir" });
    await userEvent.click(trigger);
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
    await userEvent.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
  });

  it("Escape dentro de un ConfirmDialog abierto desde el modal solo cierra el confirm", async () => {
    const onClose = vi.fn();
    const Harness = () => {
      const [confirming, setConfirming] = useState(false);
      return (
        <Modal open onClose={onClose} title="Florales">
          <button onClick={() => setConfirming(true)}>Retirar</button>
          <ConfirmDialog
            open={confirming}
            title="Retirar «Florales»"
            confirmLabel="Confirmar"
            onConfirm={() => {}}
            onCancel={() => setConfirming(false)}
          />
        </Modal>
      );
    };
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Retirar" }));
    expect(screen.getAllByRole("dialog")).toHaveLength(2);
    await userEvent.keyboard("{Escape}");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});
