import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { ToastProvider } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/ApiError";
import { chooseOption } from "../../helpers/select";

const { client, replaceMock } = vi.hoisted(() => ({
  client: { get: vi.fn(), updateTax: vi.fn(), updateShipping: vi.fn() },
  replaceMock: vi.fn(),
}));
vi.mock("@/lib/api/adminSettings", () => ({ settingsClient: client }));
vi.mock("@/lib/api/auth", () => ({ resetTwoFactor: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/ajustes",
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), refresh: vi.fn() }),
}));

const ORIGIN = {
  name: "Gira Clothing",
  phone: "5512345678",
  line1: "Av. Juárez 10",
  district: "Centro",
  city: "Ciudad de México",
  state: "CX",
  postalCode: "06000",
};

const makeSettings = (overrides: Record<string, unknown> = {}) => ({
  id: "s1",
  shipping: {
    origin: null,
    freeShippingThreshold: null,
    parcel: { tareGrams: 150, boxLengthCm: 30, boxWidthCm: 25, boxHeightCm: 5, extraUnitHeightCm: 3, maxWeightGrams: 20000 },
    quoteTtlMinutes: 30,
  },
  currency: { mxnPerUsdCents: 1800, rounding: "up_to_50_cents", supported: ["MXN", "USD"] },
  reservation: { ttlMinutes: 30, cartInactivityDays: 30 },
  inventory: { lowStockThreshold: 3 },
  tax: { rateBps: 1600 },
  storefront: { announcement: { enabled: false, messages: [] } },
  ...overrides,
});

const renderPage = (initialSection?: "iva" | "envio" | "2fa") =>
  render(
    <ToastProvider>
      <SettingsPage initialSection={initialSection} />
    </ToastProvider>,
  );

beforeEach(() => {
  Object.values(client).forEach((fn) => {
    fn.mockReset();
  });
  client.get.mockResolvedValue(makeSettings());
  replaceMock.mockReset();
});

describe("SettingsPage", () => {
  it("muestra IVA, seguridad y envío, y avisa si falta el origen", async () => {
    renderPage();
    expect(await screen.findByText("16 %")).toBeInTheDocument();
    expect(screen.getByText("Activa")).toBeInTheDocument();
    expect(screen.getByText("Falta el origen de los paquetes")).toBeInTheDocument();
    expect(screen.getByText("No se ofrece")).toBeInTheDocument();
  });

  it("si la carga falla, «Reintentar» vuelve a pedir", async () => {
    client.get.mockRejectedValueOnce(new ApiError("Sin conexión.", "network"));
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("16 %")).toBeInTheDocument();
    expect(client.get).toHaveBeenCalledTimes(2);
  });

  it("«Editar» del IVA escribe ?seccion=iva y guardar actualiza la tarjeta", async () => {
    client.updateTax.mockResolvedValue(makeSettings({ tax: { rateBps: 800 } }));
    renderPage();
    const taxCard = (await screen.findByText("16 %")).closest("section") ?? document.body;
    await userEvent.click(within(taxCard as HTMLElement).getByRole("button", { name: "Editar" }));
    expect(replaceMock).toHaveBeenLastCalledWith("/ajustes?seccion=iva", { scroll: false });

    const dialog = await screen.findByRole("dialog", { name: "Tasa de IVA" });
    expect(within(dialog).getByText(/conservan su tasa y su total/)).toBeInTheDocument();
    const save = within(dialog).getByRole("button", { name: "Guardar" });
    expect(save).toBeDisabled();
    const field = within(dialog).getByLabelText("Tasa de IVA (%)");
    await userEvent.clear(field);
    await userEvent.type(field, "8");
    await userEvent.click(save);

    await waitFor(() => expect(client.updateTax).toHaveBeenCalledWith(800));
    expect(await screen.findByText("8 %")).toBeInTheDocument();
    expect(replaceMock).toHaveBeenLastCalledWith("/ajustes", { scroll: false });
  });

  it("una tasa inválida queda sobre el campo y no llega al API", async () => {
    renderPage("iva");
    const dialog = await screen.findByRole("dialog", { name: "Tasa de IVA" });
    const field = within(dialog).getByLabelText("Tasa de IVA (%)");
    await userEvent.clear(field);
    await userEvent.type(field, "120");
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
    expect(await within(dialog).findByText("La tasa no puede superar el 100 %.")).toBeInTheDocument();
    expect(client.updateTax).not.toHaveBeenCalled();
  });

  it("un error del API al guardar el IVA se muestra y el modal sigue abierto", async () => {
    client.updateTax.mockRejectedValue(new ApiError("La tasa de IVA no puede superar el 100 %.", "http", 400));
    renderPage("iva");
    const dialog = await screen.findByRole("dialog", { name: "Tasa de IVA" });
    const field = within(dialog).getByLabelText("Tasa de IVA (%)");
    await userEvent.clear(field);
    await userEvent.type(field, "10");
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
    expect(await within(dialog).findByText("La tasa de IVA no puede superar el 100 %.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Tasa de IVA" })).toBeInTheDocument();
  });

  it("cerrar con cambios sin guardar pregunta antes de descartar", async () => {
    renderPage("iva");
    const dialog = await screen.findByRole("dialog", { name: "Tasa de IVA" });
    await userEvent.type(within(dialog).getByLabelText("Tasa de IVA (%)"), "5");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(await screen.findByText("¿Descartar los cambios?")).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("envío: valida el origen y guarda todo en un PATCH", async () => {
    client.updateShipping.mockResolvedValue(makeSettings({ shipping: { ...makeSettings().shipping, origin: ORIGIN } }));
    renderPage("envio");
    const dialog = await screen.findByRole("dialog", { name: "Envío" });
    await userEvent.type(within(dialog).getByLabelText("Nombre o negocio"), "Gira");
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
    expect(await within(dialog).findByText("El teléfono tiene 10 dígitos.")).toBeInTheDocument();
    expect(client.updateShipping).not.toHaveBeenCalled();

    await userEvent.type(within(dialog).getByLabelText("Nombre o negocio"), " Clothing");
    await userEvent.type(within(dialog).getByLabelText("Teléfono"), ORIGIN.phone);
    await userEvent.type(within(dialog).getByLabelText("Calle y número"), ORIGIN.line1);
    await userEvent.type(within(dialog).getByLabelText("Colonia"), ORIGIN.district);
    await userEvent.type(within(dialog).getByLabelText("Ciudad"), ORIGIN.city);
    await chooseOption(within(dialog).getByRole("combobox", { name: "Estado" }), "Ciudad de México");
    await userEvent.type(within(dialog).getByLabelText("Código postal"), ORIGIN.postalCode);
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(client.updateShipping).toHaveBeenCalledWith(
        expect.objectContaining({ origin: ORIGIN, freeShippingThreshold: null, quoteTtlMinutes: 30 }),
      ),
    );
    expect(await screen.findByText("Gira Clothing")).toBeInTheDocument();
    expect(screen.queryByText("Falta el origen de los paquetes")).not.toBeInTheDocument();
  });

  it("?seccion=2fa abre el reinicio de 2FA", async () => {
    renderPage("2fa");
    expect(await screen.findByRole("dialog", { name: "Reiniciar verificación en dos pasos" })).toBeInTheDocument();
  });
});
