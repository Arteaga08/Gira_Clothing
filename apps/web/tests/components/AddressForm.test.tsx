import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AddressForm } from "@/components/orders/detail/AddressForm";
import { makeOrder } from "../helpers/orders";

const address = makeOrder().shipping;

const setup = (props: { onSubmit?: (a: typeof address) => Promise<boolean>; labelWillBeReplaced?: boolean } = {}) => {
  const onSubmit = props.onSubmit ?? vi.fn().mockResolvedValue(true);
  const onCancel = vi.fn();
  render(<AddressForm address={address} labelWillBeReplaced={props.labelWillBeReplaced ?? false} onSubmit={onSubmit} onCancel={onCancel} />);
  return { onSubmit, onCancel };
};

describe("AddressForm", () => {
  it("el código postal es de solo lectura y explica por qué", () => {
    setup();
    const postal = screen.getByLabelText("Código postal");
    expect(postal).toHaveAttribute("readonly");
    expect(postal).toHaveValue("44160");
    expect(screen.getByText(/cambia el costo del envío/)).toBeInTheDocument();
  });

  it("el estado es una lista de los estados de México con el actual elegido", async () => {
    setup();
    const trigger = screen.getByRole("combobox", { name: "Estado" });
    expect(trigger).toHaveTextContent("Jalisco");
    await userEvent.click(trigger);
    expect(screen.getByRole("option", { name: "Ciudad de México" })).toBeInTheDocument();
  });

  it("no envía con campos inválidos y marca cada error", async () => {
    const { onSubmit } = setup();
    await userEvent.clear(screen.getByLabelText("Destinatario"));
    await userEvent.clear(screen.getByLabelText("Colonia"));
    await userEvent.click(screen.getByRole("button", { name: "Guardar dirección" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getAllByText("Escribe al menos 2 caracteres.")).toHaveLength(2);
  });

  it("envía la dirección recortada, siempre con país MX, y cierra si la API aceptó", async () => {
    const { onSubmit, onCancel } = setup();
    const recipient = screen.getByLabelText("Destinatario");
    await userEvent.clear(recipient);
    await userEvent.type(recipient, "  Ana Ruiz  ");
    await userEvent.click(screen.getByRole("button", { name: "Guardar dirección" }));
    expect(onSubmit).toHaveBeenCalledWith({ ...address, recipient: "Ana Ruiz", country: "MX" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("si la API rechaza, el formulario queda abierto", async () => {
    const { onCancel } = setup({ onSubmit: vi.fn().mockResolvedValue(false) });
    await userEvent.click(screen.getByRole("button", { name: "Guardar dirección" }));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("la línea 2 vacía no se manda", async () => {
    const { onSubmit } = setup();
    await userEvent.clear(screen.getByLabelText("Interior o referencias (opcional)"));
    await userEvent.click(screen.getByRole("button", { name: "Guardar dirección" }));
    const sent = vi.mocked(onSubmit).mock.calls[0]![0];
    expect("line2" in sent).toBe(false);
  });

  it("avisa que la guía lista se cambiará", () => {
    setup({ labelWillBeReplaced: true });
    expect(screen.getByText("Se cambiará la guía")).toBeInTheDocument();
  });
});
