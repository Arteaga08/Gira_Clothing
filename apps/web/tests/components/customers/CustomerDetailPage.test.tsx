import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerDetailPage } from "@/components/customers/CustomerDetailPage";
import { ToastProvider } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/ApiError";
import { CUSTOMER_ID, makePanelCustomer } from "../../helpers/customers";
import { makeOrder } from "../../helpers/orders";

const client = vi.hoisted(() => ({
  current: null as null | ReturnType<typeof import("../../helpers/customers").makeCustomerClientMock>,
}));
vi.mock("@/lib/api/adminCustomers", async () => {
  const { makeCustomerClientMock: make } = await import("../../helpers/customers");
  client.current = make();
  return { customerClient: client.current };
});

const orders = vi.hoisted(() => ({ listOrders: vi.fn() }));
vi.mock("@/lib/api/adminOrders", () => orders);

const mock = () => client.current!;
const ORDER = makeOrder({ orderNumber: "GC-7K2M9QXA" });

const renderPage = (initialGiveOpen = false) =>
  render(
    <ToastProvider>
      <CustomerDetailPage customerId={CUSTOMER_ID} initialGiveOpen={initialGiveOpen} />
    </ToastProvider>,
  );

beforeEach(() => {
  Object.values(mock()).forEach((fn) => {
    fn.mockReset();
  });
  orders.listOrders.mockReset();
  mock().get.mockResolvedValue(makePanelCustomer());
  orders.listOrders.mockResolvedValue({ orders: [ORDER], meta: { total: 1, page: 1, pages: 1, limit: 5 } });
});

describe("Cliente · ficha", () => {
  it("muestra nombre, correo y las métricas", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Mariana Ocampo", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("mariana@example.com")).toBeInTheDocument();
    const profile = screen.getByRole("region", { name: "Cliente" });
    expect(within(profile).getByText("$48,260.00")).toBeInTheDocument();
    expect(within(profile).getByText("19")).toBeInTheDocument();
    expect(within(profile).getByText("Sí")).toBeInTheDocument();
  });

  it("pide los pedidos de ese cliente y enlaza cada folio a su pedido", async () => {
    renderPage();
    const link = await screen.findByRole("link", { name: "GC-7K2M9QXA" });
    expect(link).toHaveAttribute("href", `/pedidos/${ORDER.id}`);
    expect(orders.listOrders).toHaveBeenCalledWith(`customer=${CUSTOMER_ID}&sort=-createdAt&limit=5`);
  });

  it("si fallan los pedidos, el encabezado sigue y ofrece «Reintentar»", async () => {
    orders.listOrders.mockRejectedValueOnce(new ApiError("Falló.", "network")).mockResolvedValueOnce({
      orders: [ORDER],
      meta: { total: 1, page: 1, pages: 1, limit: 5 },
    });
    renderPage();
    expect(await screen.findByText("No se pudieron cargar los pedidos")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Mariana Ocampo", level: 1 })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("link", { name: "GC-7K2M9QXA" })).toBeInTheDocument();
  });

  it("sin pedidos muestra el vacío", async () => {
    orders.listOrders.mockResolvedValue({ orders: [], meta: { total: 0, page: 1, pages: 1, limit: 5 } });
    renderPage();
    expect(await screen.findByText("Este cliente todavía no ha comprado nada.")).toBeInTheDocument();
  });

  it("un cliente que no existe (404) lo dice y ofrece volver", async () => {
    mock().get.mockRejectedValue(new ApiError("El cliente no existe.", "http", 404));
    renderPage();
    expect(await screen.findByText("Cliente no encontrado")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver a Clientes" })).toHaveAttribute("href", "/clientes");
  });

  it("un error de red ofrece «Reintentar» y se recupera", async () => {
    mock().get.mockRejectedValueOnce(new ApiError("Sin conexión.", "network")).mockResolvedValueOnce(makePanelCustomer());
    renderPage();
    expect(await screen.findByText("No se pudo cargar el cliente")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("heading", { name: "Mariana Ocampo", level: 1 })).toBeInTheDocument();
  });

  it("«Dar cupón» abre el modal; ?cupon=nuevo lo abre al cargar", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Dar cupón" }));
    expect(await screen.findByRole("dialog", { name: "Dar cupón a Mariana" })).toBeInTheDocument();
  });

  it("initialGiveOpen abre el modal sin clic", async () => {
    renderPage(true);
    expect(await screen.findByRole("dialog", { name: "Dar cupón a Mariana" })).toBeInTheDocument();
  });
});
