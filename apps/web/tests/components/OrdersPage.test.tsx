import { OrderStatus } from "@gira/shared";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrdersPage } from "@/components/orders/OrdersPage";
import { ToastProvider } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/ApiError";
import { parseOrderFilters } from "@/lib/orders/filters";
import { makeOrder, orderOf } from "../helpers/orders";
import { chooseOption } from "../helpers/select";

const api = vi.hoisted(() => ({
  listOrders: vi.fn(),
  getOrderSummary: vi.fn(),
  bulkMarkProcessing: vi.fn(),
  updateOrderStatus: vi.fn(),
  markShipped: vi.fn(),
}));
vi.mock("@/lib/api/adminOrders", () => api);

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/pedidos",
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), refresh: vi.fn() }),
}));

const ID_A = "aaaaaaaaaaaaaaaaaaaaaaa1";
const ID_B = "bbbbbbbbbbbbbbbbbbbbbbb2";
const ID_C = "ccccccccccccccccccccccc3";

const paidA = orderOf(OrderStatus.PAID, { id: ID_A, orderNumber: "GC-AAAAAAAA" });
const paidB = orderOf(OrderStatus.PAID, { id: ID_B, orderNumber: "GC-BBBBBBBB" });
const shippedC = orderOf(OrderStatus.SHIPPED, { id: ID_C, orderNumber: "GC-CCCCCCCC" });

const page = (orders: ReturnType<typeof makeOrder>[]) => ({
  orders,
  meta: { total: orders.length, page: 1, pages: 1, limit: 20 },
});

const pageElement = (params: Record<string, string> = {}) => (
  <ToastProvider>
    <OrdersPage initialFilters={parseOrderFilters(params)} />
  </ToastProvider>
);

const renderPage = (params: Record<string, string> = {}) => render(pageElement(params));

const stubDesktop = (matches: boolean) => {
  window.matchMedia = vi.fn().mockReturnValue({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as never;
};

beforeEach(() => {
  stubDesktop(true);
  Object.values(api).forEach((mock) => mock.mockReset());
  replaceMock.mockReset();
  api.listOrders.mockResolvedValue(page([paidA, paidB]));
  api.getOrderSummary.mockResolvedValue({
    countsByStatus: { pending_payment: 1, paid: 2, processing: 1, shipped: 3, delivered: 4, cancelled: 9, expired: 0, refunded: 0 },
  });
});

describe("OrdersPage: pestañas", () => {
  it("abre en Pagado, pide status=paid y muestra los conteos por estado", async () => {
    renderPage();
    expect(await screen.findByRole("link", { name: /GC-BBBBBBBB/ })).toBeInTheDocument();
    expect(api.listOrders).toHaveBeenCalledWith(expect.stringContaining("status=paid"));
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Pago pendiente1",
      "Pagado2",
      "En proceso1",
      "Enviado3",
      "Recibido4",
      "Todos",
    ]);
    expect(screen.getByRole("tab", { name: /Pagado/ })).toHaveAttribute("aria-selected", "true");
  });

  it("cambiar de pestaña vuelve a pedir con ese estado y actualiza la URL", async () => {
    renderPage();
    await screen.findByRole("link", { name: /GC-BBBBBBBB/ });
    api.listOrders.mockResolvedValue(page([shippedC]));

    await userEvent.click(screen.getByRole("tab", { name: /Enviado/ }));

    await waitFor(() => expect(api.listOrders).toHaveBeenLastCalledWith(expect.stringContaining("status=shipped")));
    expect(replaceMock).toHaveBeenCalledWith("/pedidos?tab=shipped", { scroll: false });
    expect(await screen.findByRole("link", { name: /GC-CCCCCCCC/ })).toBeInTheDocument();
  });

  it("Todos muestra el selector de estado para llegar a los cancelados", async () => {
    renderPage({ tab: "all" });
    await screen.findByRole("link", { name: /GC-BBBBBBBB/ });
    expect(screen.getByLabelText("Estado")).toBeInTheDocument();
    expect(api.listOrders).toHaveBeenCalledWith(expect.not.stringContaining("status="));
    await chooseOption(screen.getByLabelText("Estado"), /cancelad/i);
    await waitFor(() => expect(api.listOrders).toHaveBeenLastCalledWith(expect.stringContaining("status=cancelled")));
  });

  it("en las demás pestañas no hay selector de estado", async () => {
    renderPage();
    await screen.findByRole("link", { name: /GC-BBBBBBBB/ });
    expect(screen.queryByLabelText("Estado")).not.toBeInTheDocument();
  });
});

describe("OrdersPage: filtros", () => {
  it("un folio incompleto no consulta; uno inválido completo muestra el formato", async () => {
    renderPage();
    await screen.findByRole("link", { name: /GC-BBBBBBBB/ });
    const calls = api.listOrders.mock.calls.length;
    await userEvent.type(screen.getByLabelText("Folio exacto"), "gc-7kq");
    expect(api.listOrders).toHaveBeenCalledTimes(calls);
    await userEvent.clear(screen.getByLabelText("Folio exacto"));
    await userEvent.type(screen.getByLabelText("Folio exacto"), "GC-00000000");
    expect(screen.getByText("El folio tiene el formato GC-XXXXXXXX.")).toBeInTheDocument();
    expect(api.listOrders).toHaveBeenCalledTimes(calls);
  });

  it("un folio válido, en minúsculas, se manda en mayúsculas", async () => {
    renderPage();
    await screen.findByRole("link", { name: /GC-BBBBBBBB/ });
    await userEvent.type(screen.getByLabelText("Folio exacto"), "gc-7kq3m2xv");
    await waitFor(() => expect(api.listOrders).toHaveBeenLastCalledWith(expect.stringContaining("orderNumber=GC-7KQ3M2XV")));
  });

  it("la búsqueda espera 300 ms después de la última tecla", async () => {
    renderPage();
    await screen.findByRole("link", { name: /GC-BBBBBBBB/ });
    const calls = api.listOrders.mock.calls.length;
    await userEvent.type(screen.getByLabelText("Buscar cliente"), "ana");
    expect(api.listOrders).toHaveBeenCalledTimes(calls);
    await waitFor(() => expect(api.listOrders).toHaveBeenLastCalledWith(expect.stringContaining("search=ana")), { timeout: 1500 });
  });

  it("Solo urgentes pide priority=urgente", async () => {
    renderPage();
    await screen.findByRole("link", { name: /GC-BBBBBBBB/ });
    await userEvent.click(screen.getByRole("switch", { name: "Solo urgentes" }));
    await waitFor(() => expect(api.listOrders).toHaveBeenLastCalledWith(expect.stringContaining("priority=urgente")));
  });
});

describe("OrdersPage: vista previa, lote y estados", () => {
  it("la vista previa muestra el primer pedido y cambia al elegir otro", async () => {
    renderPage();
    const preview = await screen.findByRole("complementary", { name: "Vista previa de GC-AAAAAAAA" });
    expect(within(preview).getByRole("link", { name: /Abrir pedido/ })).toHaveAttribute("href", `/pedidos/${ID_A}`);
    await userEvent.click(screen.getByRole("link", { name: /GC-BBBBBBBB/ }));
    expect(await screen.findByRole("complementary", { name: "Vista previa de GC-BBBBBBBB" })).toBeInTheDocument();
  });

  it("en pantallas sin vista previa la tarjeta es un enlace al detalle y no la selecciona", async () => {
    stubDesktop(false);
    renderPage();
    const link = await screen.findByRole("link", { name: /GC-BBBBBBBB/ });
    expect(link).toHaveAttribute("href", `/pedidos/${ID_B}`);
    const preventDefault = vi.fn();
    link.addEventListener("click", (event) => {
      if (event.defaultPrevented) preventDefault();
      event.preventDefault();
    });
    await userEvent.click(link);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("la casilla de lote solo existe en pedidos pagados", async () => {
    api.listOrders.mockResolvedValue(page([paidA, shippedC]));
    renderPage({ tab: "all" });
    await screen.findByRole("link", { name: /GC-CCCCCCCC/ });
    expect(screen.getByLabelText("Seleccionar GC-AAAAAAAA")).toBeInTheDocument();
    expect(screen.queryByLabelText("Seleccionar GC-CCCCCCCC")).not.toBeInTheDocument();
  });

  it("seleccionar dos y pasar a en proceso llama al lote con sus ids y refresca", async () => {
    api.bulkMarkProcessing.mockResolvedValue({
      results: [],
      summary: { updated: 2, unchanged: 0, rejected: 0 },
    });
    renderPage();
    await screen.findByRole("link", { name: /GC-BBBBBBBB/ });
    await userEvent.click(screen.getByLabelText("Seleccionar GC-AAAAAAAA"));
    await userEvent.click(screen.getByLabelText("Seleccionar GC-BBBBBBBB"));
    const bar = screen.getByRole("region", { name: "Acciones en lote" });
    expect(within(bar).getByText("2 pedidos seleccionados")).toBeInTheDocument();
    const listCalls = api.listOrders.mock.calls.length;

    await userEvent.click(within(bar).getByRole("button", { name: "Pasar a en proceso" }));

    expect(api.bulkMarkProcessing).toHaveBeenCalledWith([ID_A, ID_B]);
    await waitFor(() => expect(api.listOrders.mock.calls.length).toBeGreaterThan(listCalls));
    expect(api.getOrderSummary.mock.calls.length).toBeGreaterThan(1);
    expect(screen.queryByRole("region", { name: "Acciones en lote" })).not.toBeInTheDocument();
  });

  it("sin pedidos dibuja el vacío de la pestaña", async () => {
    api.listOrders.mockResolvedValue(page([]));
    renderPage();
    expect(await screen.findByText("No hay pedidos pagados por atender")).toBeInTheDocument();
  });

  it("con filtros activos y sin resultados dice que ningún pedido coincide", async () => {
    api.listOrders.mockResolvedValue(page([]));
    renderPage({ q: "zzz" });
    expect(await screen.findByText("Ningún pedido coincide")).toBeInTheDocument();
  });

  it("si la lista falla muestra el error de la API y reintenta", async () => {
    api.listOrders.mockRejectedValueOnce(new ApiError("No hay conexión con el servidor.", "network"));
    renderPage();
    expect(await screen.findByText("No hay conexión con el servidor.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("link", { name: /GC-BBBBBBBB/ })).toBeInTheDocument();
  });

  it("nunca pinta el publicId", async () => {
    renderPage();
    await screen.findByRole("link", { name: /GC-BBBBBBBB/ });
    expect(document.body.textContent).not.toContain("PUBLIC-ID-SECRETO");
  });
});

describe("OrdersPage: la URL manda", () => {
  it("un cambio externo de la URL (enlace del menú, atrás/adelante) reemplaza los filtros", async () => {
    const view = renderPage();
    await screen.findByRole("link", { name: /GC-BBBBBBBB/ });
    api.listOrders.mockResolvedValue(page([shippedC]));

    view.rerender(pageElement({ tab: "shipped", q: "carlos" }));

    await waitFor(() => expect(api.listOrders).toHaveBeenLastCalledWith(expect.stringContaining("status=shipped")));
    expect(api.listOrders).toHaveBeenLastCalledWith(expect.stringContaining("search=carlos"));
    expect(screen.getByRole("tab", { name: /Enviado/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Buscar cliente")).toHaveValue("carlos");
  });

  it("la URL que el propio componente escribió no deshace el cambio al volver del servidor", async () => {
    const view = renderPage();
    await screen.findByRole("link", { name: /GC-BBBBBBBB/ });
    api.listOrders.mockResolvedValue(page([shippedC]));
    await userEvent.click(screen.getByRole("tab", { name: /Enviado/ }));
    await screen.findByRole("link", { name: /GC-CCCCCCCC/ });
    const callsBefore = api.listOrders.mock.calls.length;

    view.rerender(pageElement({ tab: "shipped" }));

    expect(screen.getByRole("tab", { name: /Enviado/ })).toHaveAttribute("aria-selected", "true");
    expect(api.listOrders.mock.calls.length).toBe(callsBefore);
  });

  it("si una acción vacía la página en la que estás, vuelve a la última página que existe", async () => {
    api.listOrders.mockResolvedValueOnce({ orders: [], meta: { total: 20, page: 2, pages: 1, limit: 20 } });
    api.listOrders.mockResolvedValue(page([paidA, paidB]));
    renderPage({ page: "2" });
    await screen.findByRole("link", { name: /GC-AAAAAAAA/ });
    expect(api.listOrders).toHaveBeenNthCalledWith(1, expect.stringContaining("page=2"));
    expect(api.listOrders).toHaveBeenLastCalledWith(expect.stringContaining("page=1"));
    expect(replaceMock).toHaveBeenCalledWith("/pedidos", { scroll: false });
  });

  it("si falla un refresco tras una acción, las filas siguen a la vista con un aviso", async () => {
    api.updateOrderStatus.mockResolvedValue(orderOf(OrderStatus.PROCESSING, { id: ID_A, orderNumber: "GC-AAAAAAAA" }));
    renderPage();
    const preview = await screen.findByRole("complementary", { name: "Vista previa de GC-AAAAAAAA" });
    api.listOrders.mockRejectedValue(new ApiError("No hay conexión con el servidor.", "network"));

    await userEvent.click(within(preview).getByRole("button", { name: "Pasar a en proceso" }));

    expect(await screen.findByText("No se pudo actualizar la lista")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /GC-BBBBBBBB/ })).toBeInTheDocument();
  });
});

describe("OrdersPage: un solo botón amarillo", () => {
  it("con la barra de lote visible, la vista previa pasa a botón secundario", async () => {
    renderPage();
    const preview = await screen.findByRole("complementary", { name: "Vista previa de GC-AAAAAAAA" });
    expect(within(preview).getByRole("button", { name: "Pasar a en proceso" }).className).toContain("bg-cta");

    await userEvent.click(screen.getByLabelText("Seleccionar GC-BBBBBBBB"));

    expect(within(preview).getByRole("button", { name: "Pasar a en proceso" }).className).not.toContain("bg-cta");
    const bar = screen.getByRole("region", { name: "Acciones en lote" });
    expect(within(bar).getByRole("button", { name: "Pasar a en proceso" }).className).toContain("bg-cta");
  });
});

describe("OrdersPage: el campo de folio", () => {
  it("editar un folio ya aplicado hasta dejarlo incompleto quita ese filtro", async () => {
    renderPage();
    await screen.findByRole("link", { name: /GC-BBBBBBBB/ });
    const folio = screen.getByLabelText("Folio exacto");
    await userEvent.type(folio, "GC-7KQ3M2XV");
    await waitFor(() => expect(api.listOrders).toHaveBeenLastCalledWith(expect.stringContaining("orderNumber=GC-7KQ3M2XV")));

    await userEvent.type(folio, "{Backspace}");

    await waitFor(() => expect(api.listOrders).toHaveBeenLastCalledWith(expect.not.stringContaining("orderNumber=")));
    expect(folio).toHaveValue("GC-7KQ3M2X");
  });
});
