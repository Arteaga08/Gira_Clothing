import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { BillingSection } from "@/components/store/account/billing/BillingSection";
import { jsonResponse, stubFetch } from "../../helpers/fetchMock";
import { chooseOption } from "../../helpers/select";

const BILLING = { rfc: "LOMM910312AB1", legalName: "María López Martínez", fiscalRegime: "612", cfdiUse: "G03", postalCode: "06000" };
const ok = (billing: unknown) => jsonResponse(200, { status: "success", message: "ok", data: { billing } });

const fillForm = async () => {
  await userEvent.type(screen.getByLabelText("RFC"), "lomm910312ab1");
  await userEvent.type(screen.getByLabelText("Nombre o razón social"), "María López Martínez");
  await chooseOption(screen.getByRole("combobox", { name: /Régimen fiscal/ }), /^612/);
  await chooseOption(screen.getByRole("combobox", { name: /Uso de CFDI/ }), /^G03/);
  await userEvent.type(screen.getByLabelText("Código postal fiscal"), "06000");
};

describe("BillingSection", () => {
  it("sin datos: estado vacío que aclara que no se emiten facturas", () => {
    render(<BillingSection initialBilling={null} />);
    expect(screen.getByText("No has guardado datos fiscales")).toBeInTheDocument();
    expect(screen.getByText(/todavía no emitimos facturas/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agregar datos fiscales" })).toBeInTheDocument();
  });

  it("con datos: los muestra con el nombre del régimen y del uso de CFDI", () => {
    render(<BillingSection initialBilling={BILLING} />);
    expect(screen.getByText("LOMM910312AB1")).toBeInTheDocument();
    expect(screen.getByText(/612 · Personas Físicas con Actividades Empresariales/)).toBeInTheDocument();
    expect(screen.getByText("G03 · Gastos en general")).toBeInTheDocument();
  });

  it("agregar: valida, escribe el RFC en mayúsculas, manda PUT y muestra los datos", async () => {
    const fetchMock = stubFetch();
    render(<BillingSection initialBilling={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Agregar datos fiscales" }));
    expect(screen.getByLabelText("RFC")).toHaveFocus();

    await userEvent.click(screen.getByRole("button", { name: "Guardar datos fiscales" }));
    expect(screen.getByText("Falta el RFC.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(ok(BILLING));
    await fillForm();
    expect(screen.getByLabelText("RFC")).toHaveValue("LOMM910312AB1");
    await userEvent.click(screen.getByRole("button", { name: "Guardar datos fiscales" }));

    await waitFor(() => expect(screen.getByText("Guardamos tus datos fiscales.")).toBeInTheDocument());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/account/billing");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual(BILLING);
    expect(screen.getByRole("heading", { name: "Datos fiscales" })).toHaveFocus();
  });

  it("un error del API se muestra y deja el formulario abierto", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { status: "fail", message: "El RFC no es válido." }));
    render(<BillingSection initialBilling={BILLING} />);
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar datos fiscales" }));
    expect(await screen.findByText("El RFC no es válido.")).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Datos fiscales" })).toBeInTheDocument();
  });

  it("eliminar pide confirmación; al confirmar borra y vuelve al estado vacío", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok(null));
    render(<BillingSection initialBilling={BILLING} />);
    await userEvent.click(screen.getByRole("button", { name: "Eliminar datos fiscales" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(screen.getByText("No has guardado datos fiscales")).toBeInTheDocument());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/account/billing");
    expect(init.method).toBe("DELETE");
    expect(screen.getByText("Eliminamos tus datos fiscales.")).toBeInTheDocument();
  });

  it("cancelar el diálogo no llama al API", async () => {
    const fetchMock = stubFetch();
    render(<BillingSection initialBilling={BILLING} />);
    await userEvent.click(screen.getByRole("button", { name: "Eliminar datos fiscales" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelar" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
