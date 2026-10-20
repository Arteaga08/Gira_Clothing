import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ShipButton } from "@/components/orders/ShipButton";

const renderButton = (props: Partial<React.ComponentProps<typeof ShipButton>> = {}) => {
  const onShip = vi.fn();
  render(<ShipButton orderNumber="GC-7KQ3M2XV" variant="primary" loading={false} onShip={onShip} {...props} />);
  return onShip;
};

describe("ShipButton", () => {
  it("al pulsar pide confirmación y todavía no marca el envío", async () => {
    const onShip = renderButton();
    await userEvent.click(screen.getByRole("button", { name: "Marcar enviado" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Se avisará al cliente por correo");
    expect(dialog).toHaveTextContent("GC-7KQ3M2XV");
    expect(onShip).not.toHaveBeenCalled();
  });

  it("confirmar llama onShip una vez y cierra el diálogo", async () => {
    const onShip = renderButton();
    await userEvent.click(screen.getByRole("button", { name: "Marcar enviado" }));
    await userEvent.click(screen.getByRole("button", { name: "Sí, marcar enviado" }));

    expect(onShip).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("cancelar no marca el envío", async () => {
    const onShip = renderButton();
    await userEvent.click(screen.getByRole("button", { name: "Marcar enviado" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onShip).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("deshabilitado no abre el diálogo", async () => {
    const onShip = renderButton({ disabled: true });
    await userEvent.click(screen.getByRole("button", { name: "Marcar enviado" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onShip).not.toHaveBeenCalled();
  });
});
