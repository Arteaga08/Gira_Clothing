import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { COUPON_CODE_TAKEN_MESSAGE } from "@gira/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GiveCouponModal } from "@/components/customers/GiveCouponModal";
import { ToastProvider } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/ApiError";
import { chooseOption } from "../../helpers/select";
import { makePanelCoupon } from "../../helpers/coupons";
import { makePanelCustomer } from "../../helpers/customers";

const client = vi.hoisted(() => ({
  current: null as null | ReturnType<typeof import("../../helpers/customers").makeCustomerClientMock>,
}));
vi.mock("@/lib/api/adminCustomers", async () => {
  const { makeCustomerClientMock: make } = await import("../../helpers/customers");
  client.current = make();
  return { customerClient: client.current };
});

const mock = () => client.current!;
const CUSTOMER = makePanelCustomer({ firstName: "Ana", lastName: "Pérez", email: "ana@example.com" });

const renderModal = (onClose = vi.fn()) => {
  render(
    <ToastProvider>
      <GiveCouponModal customer={CUSTOMER} open onClose={onClose} />
    </ToastProvider>,
  );
  return onClose;
};

const fill = async (code: string, percent = "15") => {
  await userEvent.type(await screen.findByLabelText("Código"), code);
  await userEvent.type(screen.getByLabelText("Porcentaje (%)"), percent);
};

const submit = () => userEvent.click(screen.getByRole("button", { name: "Crear y enviar" }));

beforeEach(() => {
  Object.values(mock()).forEach((fn) => {
    fn.mockReset();
  });
});

describe("GiveCouponModal", () => {
  it("manda el cupón sin nombre ni tope, avisa que salió el correo y cierra", async () => {
    mock().giveCoupon.mockResolvedValue({ coupon: makePanelCoupon({ code: "GRACIAS-ANA" }), emailSent: true });
    const onClose = renderModal();
    await fill("gracias-ana");
    await userEvent.type(screen.getByLabelText("Mensaje para Ana (opcional)"), "Gracias por todo");
    await submit();
    await waitFor(() => expect(mock().giveCoupon).toHaveBeenCalled());
    const [id, body] = mock().giveCoupon.mock.calls[0]!;
    expect(id).toBe(CUSTOMER.id);
    expect(body).toEqual({ code: "GRACIAS-ANA", discountType: "percent", percentOff: 15, message: "Gracias por todo" });
    expect(await screen.findByText("Cupón enviado")).toBeInTheDocument();
    expect(screen.getByText("GRACIAS-ANA le llegó a ana@example.com.")).toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
  });

  it("si el correo no salió lo avisa con el código para pasárselo", async () => {
    mock().giveCoupon.mockResolvedValue({ coupon: makePanelCoupon({ code: "GRACIAS-ANA" }), emailSent: false });
    renderModal();
    await fill("GRACIAS-ANA");
    await submit();
    expect(await screen.findByText("Cupón creado, pero el correo no salió")).toBeInTheDocument();
    expect(screen.getByText("Avísale a Ana que su código es GRACIAS-ANA.")).toBeInTheDocument();
  });

  it("un código repetido (409) se queda en el campo y el modal sigue abierto", async () => {
    mock().giveCoupon.mockRejectedValue(new ApiError(COUPON_CODE_TAKEN_MESSAGE, "http", 409));
    const onClose = renderModal();
    await fill("REPETIDO");
    await submit();
    expect(await screen.findByText(COUPON_CODE_TAKEN_MESSAGE)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("otro error del servidor sale en el aviso del modal", async () => {
    mock().giveCoupon.mockRejectedValue(new ApiError("Inténtalo más tarde.", "http", 500));
    renderModal();
    await fill("GRACIAS-ANA");
    await submit();
    expect(await screen.findByText("No se pudo dar el cupón")).toBeInTheDocument();
    expect(screen.getByText("Inténtalo más tarde.")).toBeInTheDocument();
  });

  it("un formulario vacío marca los campos y no toca la red", async () => {
    renderModal();
    await submit();
    expect(await screen.findByText("El código es obligatorio.")).toBeInTheDocument();
    expect(screen.getByText("Escribe un porcentaje entero entre 1 y 100.")).toBeInTheDocument();
    expect(mock().giveCoupon).not.toHaveBeenCalled();
  });

  it("cerrar con texto escrito pregunta antes de descartar", async () => {
    const onClose = renderModal();
    await userEvent.type(await screen.findByLabelText("Código"), "ABC");
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(await screen.findByText("¿Descartar los cambios?")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("la vista previa muestra el mensaje como texto, nunca como HTML", async () => {
    renderModal();
    await userEvent.type(await screen.findByLabelText("Mensaje para Ana (opcional)"), "<b>hola</b>");
    expect(screen.getAllByText("<b>hola</b>").length).toBeGreaterThan(0);
    expect(document.querySelector("b")).toBeNull();
  });

  it("monto fijo cambia el campo de valor y manda centavos", async () => {
    mock().giveCoupon.mockResolvedValue({ coupon: makePanelCoupon({ code: "REGALO150" }), emailSent: true });
    renderModal();
    await userEvent.type(await screen.findByLabelText("Código"), "REGALO150");
    await chooseOption(screen.getByRole("combobox", { name: "Tipo de descuento" }), "Monto fijo (MXN)");
    await userEvent.type(screen.getByLabelText("Monto (MXN)"), "150.50");
    await submit();
    await waitFor(() => expect(mock().giveCoupon).toHaveBeenCalled());
    expect(mock().giveCoupon.mock.calls[0]![1]).toMatchObject({ discountType: "fixed", amountOffMxn: 15_050 });
  });
});
