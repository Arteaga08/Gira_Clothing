import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomersPage } from "@/components/customers/CustomersPage";
import { ApiError } from "@/lib/api/ApiError";
import { parseCustomerFilters } from "@/lib/customers/filters";
import { chooseOption } from "../../helpers/select";
import { makePanelCustomer, makeRanking } from "../../helpers/customers";

const client = vi.hoisted(() => ({
  current: null as null | ReturnType<typeof import("../../helpers/customers").makeCustomerClientMock>,
}));
vi.mock("@/lib/api/adminCustomers", async () => {
  const { makeCustomerClientMock: make } = await import("../../helpers/customers");
  client.current = make();
  return { customerClient: client.current };
});

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/clientes",
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), refresh: vi.fn() }),
}));

const mock = () => client.current!;
const listPage = (items = [makePanelCustomer()]) => ({
  items,
  meta: { total: items.length, page: 1, pages: 1, limit: 20 },
});

const renderPage = (params: Record<string, string> = {}) =>
  render(<CustomersPage initialFilters={parseCustomerFilters(params)} />);

beforeEach(() => {
  Object.values(mock()).forEach((fn) => {
    fn.mockReset();
  });
  mock().top.mockResolvedValue(makeRanking(5));
  mock().list.mockResolvedValue(listPage());
  replaceMock.mockReset();
});

describe("Clientes · ranking", () => {
  it("muestra el podio con los tres primeros y las filas del 4 al 5", async () => {
    renderPage();
    const podium = await screen.findByRole("list", { name: "Podio" });
    expect(within(podium).getAllByRole("listitem")).toHaveLength(3);
    expect(within(podium).getByText("Cliente1 Prueba")).toBeInTheDocument();
    expect(within(podium).getByText("1 compra")).toBeInTheDocument();
    expect(screen.getByText("Cliente4 Prueba")).toBeInTheDocument();
    expect(screen.getByText("Cliente5 Prueba")).toBeInTheDocument();
  });

  it("pide el ranking del mes por gasto por defecto", async () => {
    renderPage();
    await screen.findByRole("list", { name: "Podio" });
    expect(mock().top).toHaveBeenCalledWith("period=month&sortBy=spent");
  });

  it("cambiar el periodo vuelve a pedir y escribe la URL en español", async () => {
    renderPage();
    await screen.findByRole("list", { name: "Podio" });
    await userEvent.click(screen.getByRole("tab", { name: "Semana" }));
    expect(replaceMock).toHaveBeenLastCalledWith("/clientes?periodo=semana", { scroll: false });
    await waitFor(() => expect(mock().top).toHaveBeenLastCalledWith("period=week&sortBy=spent"));
  });

  it("cambiar «Ordenar por» pide por compras y escribe orden=compras", async () => {
    renderPage();
    await screen.findByRole("list", { name: "Podio" });
    await chooseOption(screen.getByRole("combobox", { name: "Ordenar por" }), "Número de compras");
    expect(replaceMock).toHaveBeenLastCalledWith("/clientes?orden=compras", { scroll: false });
    await waitFor(() => expect(mock().top).toHaveBeenLastCalledWith("period=month&sortBy=orders"));
  });

  it("un error del ranking muestra «Reintentar» y se recupera", async () => {
    mock().top.mockRejectedValueOnce(new ApiError("Sin conexión.", "network")).mockResolvedValueOnce(makeRanking(3));
    renderPage();
    expect(await screen.findByText("No se pudo cargar el ranking")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Reintentar" })[0]!);
    expect(await screen.findByRole("list", { name: "Podio" })).toBeInTheDocument();
  });

  it("sin compras en el periodo muestra el vacío con su texto", async () => {
    mock().top.mockResolvedValue({ ...makeRanking(0), rows: [] });
    renderPage({ periodo: "semana" });
    expect(await screen.findByText("Sin compras en este periodo")).toBeInTheDocument();
    expect(screen.getByText("Nadie ha completado una compra desde el lunes.")).toBeInTheDocument();
  });
});

describe("Clientes · todos los clientes", () => {
  it("lista los clientes con sus métricas y un enlace a la ficha", async () => {
    renderPage();
    const link = await screen.findByRole("link", { name: "Mariana Ocampo" });
    expect(link).toHaveAttribute("href", expect.stringMatching(/^\/clientes\/68f2ab12c3d4e5f6a7b8cbb1$/));
    const row = link.closest("tr") as HTMLElement;
    expect(within(row).getByText("19")).toBeInTheDocument();
    expect(within(row).getByText("$48,260.00")).toBeInTheDocument();
  });

  it("la búsqueda se envía al API con debounce y escribe ?q=", async () => {
    renderPage();
    await screen.findByRole("link", { name: "Mariana Ocampo" });
    await userEvent.type(screen.getByRole("textbox", { name: "Buscar" }), "ana");
    await waitFor(() => expect(replaceMock).toHaveBeenLastCalledWith("/clientes?q=ana", { scroll: false }));
    await waitFor(() => expect(mock().list).toHaveBeenLastCalledWith("search=ana&page=1&limit=20"));
  });

  it("sin resultados ofrece limpiar la búsqueda", async () => {
    mock().list.mockResolvedValue(listPage([]));
    renderPage({ q: "zzz" });
    expect(await screen.findByText("Sin resultados")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Limpiar búsqueda" }));
    expect(replaceMock).toHaveBeenLastCalledWith("/clientes", { scroll: false });
  });

  it("un error de la lista muestra «Reintentar»", async () => {
    mock().list.mockRejectedValueOnce(new ApiError("Falló.", "network")).mockResolvedValueOnce(listPage());
    renderPage();
    expect(await screen.findByText("No se pudieron cargar los clientes")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Reintentar" }).at(-1)!);
    expect(await screen.findByRole("link", { name: "Mariana Ocampo" })).toBeInTheDocument();
  });
});
