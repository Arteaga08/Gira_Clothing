import { COUPON_CODE_TAKEN_MESSAGE, CouponStatus } from "@gira/shared";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CouponModal } from "@/components/coupons/CouponModal";
import { ToastProvider } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/ApiError";
import { chooseOption } from "../../helpers/select";
import { COUPON_ID, makePanelCoupon } from "../../helpers/coupons";

const client = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import("../../helpers/coupons").makeCouponClientMock> }));
vi.mock("@/lib/api/adminCoupons", async () => {
  const { makeCouponClientMock: make } = await import("../../helpers/coupons");
  client.current = make();
  return { couponClient: client.current };
});

const mock = () => client.current!;
const onClose = vi.fn();
const onChanged = vi.fn();

const renderModal = (selected: string | undefined, items = [makePanelCoupon()]) =>
  render(
    <ToastProvider>
      <CouponModal selected={selected} items={items} onClose={onClose} onChanged={onChanged} />
    </ToastProvider>,
  );

beforeEach(() => {
  Object.values(mock()).forEach((fn) => {
    fn.mockReset();
  });
  onClose.mockReset();
  onChanged.mockReset();
});

describe("CouponModal", () => {
  it("sin selección no dibuja nada", () => {
    renderModal(undefined);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("abre un cupón de la lista sin pedir nada, con sus datos", async () => {
    renderModal(COUPON_ID);
    const dialog = await screen.findByRole("dialog", { name: "Editar cupón" });
    expect(within(dialog).getByLabelText("Código")).toHaveValue("VERANO10");
    expect(within(dialog).getByLabelText("Nombre interno")).toHaveValue("Verano");
    expect(within(dialog).getByLabelText("Porcentaje (%)")).toHaveValue("10");
    expect(mock().get).not.toHaveBeenCalled();
  });

  it("«Guardar cambios» está desactivado hasta que algo cambia y manda solo lo cambiado", async () => {
    mock().update.mockResolvedValue(makePanelCoupon({ name: "Verano 2" }));
    renderModal(COUPON_ID);
    const save = await screen.findByRole("button", { name: "Guardar cambios" });
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Nombre interno"), " 2");
    expect(save).toBeEnabled();
    await userEvent.click(save);
    await waitFor(() => expect(mock().update).toHaveBeenCalledWith(COUPON_ID, { name: "Verano 2" }));
    expect(onChanged).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("crear valida los campos antes de pedir nada y luego crea con centavos y fechas de México", async () => {
    mock().create.mockResolvedValue(makePanelCoupon());
    renderModal("nuevo");
    const create = await screen.findByRole("button", { name: "Crear cupón" });
    await userEvent.click(create);
    expect(await screen.findByText("El código es obligatorio.")).toBeInTheDocument();
    expect(screen.getByText("Revisa los campos marcados.")).toBeInTheDocument();
    expect(mock().create).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText("Código"), "verano-10");
    await userEvent.type(screen.getByLabelText("Nombre interno"), "Verano");
    await chooseOption(screen.getByRole("combobox", { name: "Tipo de descuento" }), "Monto fijo (MXN)");
    await userEvent.type(screen.getByLabelText("Monto (MXN)"), "150.50");
    await userEvent.type(screen.getByLabelText("Inicia"), "01/06/2026");
    await userEvent.click(create);
    await waitFor(() =>
      expect(mock().create).toHaveBeenCalledWith({
        code: "VERANO-10",
        name: "Verano",
        discountType: "fixed",
        amountOffMxn: 15050,
        startsAt: "2026-06-01T06:00:00.000Z",
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("un monto con más de dos decimales se rechaza sin llamar al API", async () => {
    renderModal("nuevo");
    await userEvent.type(await screen.findByLabelText("Código"), "VERANO10");
    await userEvent.type(screen.getByLabelText("Nombre interno"), "Verano");
    await chooseOption(screen.getByRole("combobox", { name: "Tipo de descuento" }), "Monto fijo (MXN)");
    await userEvent.type(screen.getByLabelText("Monto (MXN)"), "150.999");
    await userEvent.click(screen.getByRole("button", { name: "Crear cupón" }));
    expect(await screen.findByText("Usa hasta 2 decimales, por ejemplo 150.50.")).toBeInTheDocument();
    expect(mock().create).not.toHaveBeenCalled();
  });

  it("el código duplicado se muestra sobre el campo Código y no cierra", async () => {
    mock().create.mockRejectedValue(new ApiError(COUPON_CODE_TAKEN_MESSAGE, "http", 409));
    renderModal("nuevo");
    await userEvent.type(await screen.findByLabelText("Código"), "VERANO10");
    await userEvent.type(screen.getByLabelText("Nombre interno"), "Verano");
    await userEvent.type(screen.getByLabelText("Porcentaje (%)"), "10");
    await userEvent.click(screen.getByRole("button", { name: "Crear cupón" }));
    const message = await screen.findByText(COUPON_CODE_TAKEN_MESSAGE);
    expect(screen.getByLabelText("Código")).toHaveAccessibleDescription(COUPON_CODE_TAKEN_MESSAGE);
    expect(message).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("otro error del servidor se muestra en el aviso del modal y no cierra", async () => {
    mock().update.mockRejectedValue(new ApiError("El tope no puede ser menor a los canjes ya hechos (4).", "http", 409));
    renderModal(COUPON_ID);
    await userEvent.type(await screen.findByLabelText("Nombre interno"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByText("El tope no puede ser menor a los canjes ya hechos (4).")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("con canjes, código, tipo y descuento son de solo lectura y nunca se envían", async () => {
    mock().update.mockResolvedValue(makePanelCoupon({ redeemedCount: 3 }));
    renderModal(COUPON_ID, [makePanelCoupon({ redeemedCount: 3 })]);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Código")).toHaveAttribute("readonly");
    expect(within(dialog).getByLabelText("Porcentaje (%)")).toHaveAttribute("readonly");
    expect(within(dialog).getByRole("combobox", { name: "Tipo de descuento" })).toBeDisabled();
    expect(within(dialog).getAllByText("Bloqueado: ya tiene 3 canjes.")).not.toHaveLength(0);
    await userEvent.type(within(dialog).getByLabelText("Nombre interno"), "!");
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(mock().update).toHaveBeenCalledWith(COUPON_ID, { name: "Verano!" }));
  });

  it("cerrar con cambios pide confirmar antes de descartar", async () => {
    renderModal(COUPON_ID);
    await userEvent.type(await screen.findByLabelText("Nombre interno"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(await screen.findByText("¿Descartar los cambios?")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("retirar pide confirmación y luego retira", async () => {
    mock().retire.mockResolvedValue(makePanelCoupon({ isActive: false, status: CouponStatus.RETIRED }));
    renderModal(COUPON_ID);
    await userEvent.click(await screen.findByRole("button", { name: "Retirar" }));
    expect(await screen.findByText("Retirar «VERANO10»")).toBeInTheDocument();
    expect(mock().retire).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Retirar cupón" }));
    await waitFor(() => expect(mock().retire).toHaveBeenCalledWith(COUPON_ID));
    expect(onChanged).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("un cupón retirado se ofrece reactivar, sin confirmar", async () => {
    mock().reactivate.mockResolvedValue(makePanelCoupon());
    renderModal(COUPON_ID, [makePanelCoupon({ isActive: false, status: CouponStatus.RETIRED })]);
    expect(await screen.findByText("Este cupón está retirado")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reactivar" }));
    await waitFor(() => expect(mock().reactivate).toHaveBeenCalledWith(COUPON_ID));
    expect(onClose).toHaveBeenCalled();
  });

  it("un id que no está en la lista se pide al API", async () => {
    mock().get.mockResolvedValue(makePanelCoupon());
    renderModal(COUPON_ID, []);
    expect(await screen.findByRole("dialog", { name: "Editar cupón" })).toBeInTheDocument();
    expect(mock().get).toHaveBeenCalledWith(COUPON_ID);
  });

  it("un id inexistente (404) ofrece cerrar, no reintentar", async () => {
    mock().get.mockRejectedValue(new ApiError("El cupón no existe.", "http", 404));
    renderModal(COUPON_ID, []);
    expect(await screen.findByText("Cupón no encontrado")).toBeInTheDocument();
    const alert = screen.getByRole("alert");
    expect(within(alert).queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
    await userEvent.click(within(alert).getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalled();
  });
});
