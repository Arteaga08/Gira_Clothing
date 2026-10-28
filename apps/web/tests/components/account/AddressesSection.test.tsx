import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AddressesSection } from "@/components/store/account/addresses/AddressesSection";
import { jsonResponse, stubFetch } from "../../helpers/fetchMock";
import { chooseOption } from "../../helpers/select";

const make = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  label: `Dir ${id}`,
  recipient: "María López",
  line1: "Calle Reforma 123",
  line2: null,
  district: "Centro",
  city: "Ciudad de México",
  state: "CX",
  postalCode: "06000",
  country: "MX",
  phone: "5512345678",
  isDefault: false,
  ...extra,
});
const ok = (addresses: unknown[]) => jsonResponse(200, { status: "success", message: "ok", data: { addresses } });

const fillAddress = async () => {
  await userEvent.type(screen.getByLabelText("Quién recibe"), "Pedro Gómez");
  await userEvent.type(screen.getByLabelText("Calle y número"), "Av. Juárez 45");
  await userEvent.type(screen.getByLabelText("Colonia"), "Roma");
  await userEvent.type(screen.getByLabelText("Ciudad"), "Puebla");
  await chooseOption(screen.getByRole("combobox", { name: /Estado/ }), "Puebla");
  await userEvent.type(screen.getByLabelText("Código postal"), "72000");
  await userEvent.type(screen.getByLabelText("Celular"), "2221234567");
};

describe("AddressesSection", () => {
  it("sin direcciones muestra el estado vacío con «Agregar dirección»", () => {
    render(<AddressesSection initialAddresses={[]} />);
    expect(screen.getByText("Aún no tienes direcciones")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agregar dirección" })).toBeEnabled();
  });

  it("lista las direcciones con el contador y la marca de predeterminada", () => {
    render(<AddressesSection initialAddresses={[make("a", { isDefault: true }), make("b")]} />);
    expect(screen.getByText("2 de 5 direcciones")).toBeInTheDocument();
    expect(screen.getAllByText("Predeterminada")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Hacer predeterminada Dir a" })).toBeNull();
    expect(screen.getByRole("button", { name: "Hacer predeterminada Dir b" })).toBeInTheDocument();
  });

  it("en el tope desactiva «Agregar» y lo explica", () => {
    const five = ["a", "b", "c", "d", "e"].map((id) => make(id));
    render(<AddressesSection initialAddresses={five} />);
    expect(screen.getByRole("button", { name: "Agregar dirección" })).toBeDisabled();
    expect(screen.getByText(/Puedes guardar hasta 5 direcciones/)).toBeInTheDocument();
  });

  it("agregar: valida, manda el cuerpo sin vacíos, vuelve a la lista y enfoca el encabezado", async () => {
    const fetchMock = stubFetch();
    render(<AddressesSection initialAddresses={[]} />);
    await userEvent.click(screen.getByRole("button", { name: "Agregar dirección" }));
    expect(screen.getByLabelText("Nombre de la dirección (opcional)")).toHaveFocus();

    await userEvent.click(screen.getByRole("button", { name: "Guardar dirección" }));
    expect(screen.getByText("Falta quién recibe.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(jsonResponse(201, { status: "success", message: "ok", data: { addresses: [make("n", { isDefault: true, recipient: "Pedro Gómez" })] } }));
    await fillAddress();
    await userEvent.click(screen.getByRole("button", { name: "Guardar dirección" }));

    await waitFor(() => expect(screen.getByText("1 de 5 direcciones")).toBeInTheDocument());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/account/addresses");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      recipient: "Pedro Gómez",
      line1: "Av. Juárez 45",
      district: "Roma",
      city: "Puebla",
      state: "PU",
      postalCode: "72000",
      country: "MX",
      phone: "2221234567",
    });
    expect(screen.getByText("Guardamos tu dirección.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tus direcciones" })).toHaveFocus();
  });

  it("«Usar como predeterminada» solo aparece al agregar cuando ya hay una", async () => {
    render(<AddressesSection initialAddresses={[make("a", { isDefault: true })]} />);
    await userEvent.click(screen.getByRole("button", { name: "Agregar dirección" }));
    expect(screen.getByLabelText("Usar como mi dirección predeterminada")).toBeInTheDocument();
  });

  it("un 409 del API (tope) se muestra y deja el formulario abierto", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse(409, { status: "fail", message: "Puedes guardar hasta 5 direcciones. Elimina una para agregar otra." }));
    render(<AddressesSection initialAddresses={[make("a", { isDefault: true })]} />);
    await userEvent.click(screen.getByRole("button", { name: "Agregar dirección" }));
    await fillAddress();
    await userEvent.click(screen.getByRole("button", { name: "Guardar dirección" }));

    expect(await screen.findByText(/Elimina una para agregar otra/)).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Agregar dirección" })).toBeInTheDocument();
  });

  it("editar: precarga, y vaciar la etiqueta manda null", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok([make("a", { label: null, isDefault: true })]));
    render(<AddressesSection initialAddresses={[make("a", { isDefault: true })]} />);
    await userEvent.click(screen.getByRole("button", { name: "Editar Dir a" }));
    const label = screen.getByLabelText("Nombre de la dirección (opcional)");
    expect(label).toHaveValue("Dir a");
    await userEvent.clear(label);
    await userEvent.click(screen.getByRole("button", { name: "Guardar dirección" }));

    await waitFor(() => expect(screen.getByText("Guardamos los cambios de la dirección.")).toBeInTheDocument());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/account/addresses/a");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toMatchObject({ label: null, line2: null });
  });

  it("hacer predeterminada reemplaza la lista con la respuesta del servidor", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok([make("a"), make("b", { isDefault: true })]));
    render(<AddressesSection initialAddresses={[make("a", { isDefault: true }), make("b")]} />);
    await userEvent.click(screen.getByRole("button", { name: "Hacer predeterminada Dir b" }));

    await waitFor(() => expect(screen.getByText("«Dir b» es ahora tu dirección predeterminada.")).toBeInTheDocument());
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe("http://api.test/api/v1/account/addresses/b/default");
    expect(screen.queryByRole("button", { name: "Hacer predeterminada Dir b" })).toBeNull();
    expect(screen.getByRole("button", { name: "Hacer predeterminada Dir a" })).toBeInTheDocument();
  });

  it("eliminar pide confirmación, avisa si otra pasará a predeterminada y cancelar no llama al API", async () => {
    const fetchMock = stubFetch();
    render(<AddressesSection initialAddresses={[make("a", { isDefault: true }), make("b")]} />);
    await userEvent.click(screen.getByRole("button", { name: "Eliminar Dir a" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Otra de tus direcciones pasará a ser la predeterminada/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("eliminar confirmado llama al API, actualiza la lista y enfoca el encabezado", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok([make("b", { isDefault: true })]));
    render(<AddressesSection initialAddresses={[make("a", { isDefault: true }), make("b")]} />);
    await userEvent.click(screen.getByRole("button", { name: "Eliminar Dir a" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(screen.getByText("1 de 5 direcciones")).toBeInTheDocument());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/account/addresses/a");
    expect(init.method).toBe("DELETE");
    expect(screen.getByRole("heading", { name: "Tus direcciones" })).toHaveFocus();
  });

  it("Cancelar en el formulario no toca el API y devuelve el foco", async () => {
    const fetchMock = stubFetch();
    render(<AddressesSection initialAddresses={[make("a", { isDefault: true })]} />);
    await userEvent.click(screen.getByRole("button", { name: "Agregar dirección" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Tus direcciones" })).toHaveFocus();
  });
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/cuenta/direcciones" }));
