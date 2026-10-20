import { act, render, screen } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const reasonField = { label: "Motivo", minLength: 5, maxLength: 300 };

describe("ConfirmDialog", () => {
  it("cerrado no renderiza nada", () => {
    render(<ConfirmDialog open={false} title="Cancelar" confirmLabel="Sí" onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("confirma y cancela con sus botones", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="Reintentar" confirmLabel="Sí, reintentar" onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: "Sí, reintentar" }));
    expect(onConfirm).toHaveBeenCalledWith(undefined);
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("con motivo: deshabilitado con 4 caracteres, habilitado con 5, y cuenta caracteres", async () => {
    render(<ConfirmDialog open title="Cancelar pedido" confirmLabel="Cancelar pedido" reasonField={reasonField} onConfirm={() => {}} onCancel={() => {}} />);
    const confirm = screen.getByRole("button", { name: "Cancelar pedido" });
    const textarea = screen.getByLabelText("Motivo");
    await userEvent.type(textarea, "abcd");
    expect(confirm).toBeDisabled();
    expect(screen.getByText(/4\/300 caracteres/)).toBeInTheDocument();
    await userEvent.type(textarea, "e");
    expect(confirm).toBeEnabled();
  });

  it("los espacios no cuentan para el mínimo y el motivo llega recortado", async () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog open title="Cancelar" confirmLabel="Confirmar" reasonField={reasonField} onConfirm={onConfirm} onCancel={() => {}} />);
    await userEvent.type(screen.getByLabelText("Motivo"), "   ab   ");
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
    await userEvent.clear(screen.getByLabelText("Motivo"));
    await userEvent.type(screen.getByLabelText("Motivo"), "  Cliente lo pidió  ");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(onConfirm).toHaveBeenCalledWith("Cliente lo pidió");
  });

  it("Escape cancela", async () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="Cancelar" confirmLabel="Sí" onConfirm={() => {}} onCancel={onCancel} />);
    await userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("mientras corre la acción bloquea el doble clic y el Escape", async () => {
    let release: () => void = () => {};
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="Reembolso" confirmLabel="Reembolsar" onConfirm={onConfirm} onCancel={onCancel} />);
    const confirm = screen.getByRole("button", { name: "Reembolsar" });
    await userEvent.click(confirm);
    await userEvent.click(confirm);
    await userEvent.keyboard("{Escape}");
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    await act(async () => release());
  });

  it("si la acción falla muestra el mensaje en el diálogo y lo deja abierto", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("Primero marca el pedido en proceso."));
    render(<ConfirmDialog open title="Reintentar" confirmLabel="Sí" onConfirm={onConfirm} onCancel={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Sí" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Primero marca el pedido en proceso.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("si el padre deja el diálogo abierto tras un intento fallido, el motivo escrito se conserva", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<ConfirmDialog open title="Cancelar" confirmLabel="Confirmar" reasonField={reasonField} onConfirm={onConfirm} onCancel={() => {}} />);
    await userEvent.type(screen.getByLabelText("Motivo"), "El cliente lo pidió");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(screen.getByLabelText("Motivo")).toHaveValue("El cliente lo pidió");
  });

  it("al cerrarse y volver a abrirse empieza limpio", async () => {
    const Harness = () => {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button onClick={() => setOpen((current) => !current)}>alternar</button>
          <ConfirmDialog open={open} title="Cancelar" confirmLabel="Confirmar" reasonField={reasonField} onConfirm={() => {}} onCancel={() => setOpen(false)} />
        </>
      );
    };
    render(<Harness />);
    await userEvent.type(screen.getByLabelText("Motivo"), "Motivo viejo");
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await userEvent.click(screen.getByRole("button", { name: "alternar" }));
    expect(screen.getByLabelText("Motivo")).toHaveValue("");
  });
});
