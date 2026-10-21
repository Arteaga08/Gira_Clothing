import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TaxonomyPage } from "@/components/taxonomy/TaxonomyPage";
import { ToastProvider } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/ApiError";
import { categoryConfig, familyConfig, type TaxonConfig } from "@/lib/taxonomy/config";
import { parseSelectedTaxon, parseTaxonFilters } from "@/lib/taxonomy/filters";
import { chooseOption } from "../../helpers/select";
import { FAMILY_2_ID, FAMILY_ID, makePanelTaxon } from "../../helpers/taxonomy";

const clients = vi.hoisted(() => ({
  family: null as null | ReturnType<typeof import("../../helpers/taxonomy").makeClientMock>,
  category: null as null | ReturnType<typeof import("../../helpers/taxonomy").makeClientMock>,
}));
vi.mock("@/lib/api/adminTaxonomy", async () => {
  const { makeClientMock: make } = await import("../../helpers/taxonomy");
  clients.family = make();
  clients.category = make();
  return { familyClient: clients.family, categoryClient: clients.category };
});

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/familias",
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), refresh: vi.fn() }),
}));

const FLORALES = makePanelTaxon();
const LUNARES = makePanelTaxon({
  id: FAMILY_2_ID,
  name: "Lunares",
  description: "",
  isActive: false,
  childCount: 0,
  activeChildCount: 0,
  activeChildren: [],
});

const page = (items = [FLORALES, LUNARES]) => ({ items, meta: { total: items.length, page: 1, pages: 1, limit: 24 } });

const renderPage = (config: TaxonConfig = familyConfig, params: Record<string, string> = {}) =>
  render(
    <ToastProvider>
      <TaxonomyPage
        kind={config.kind}
        initialFilters={parseTaxonFilters(params)}
        initialSelected={parseSelectedTaxon(params, config.param)}
      />
    </ToastProvider>,
  );

const family = () => clients.family!;

beforeEach(() => {
  Object.values(clients.family!).forEach((fn) => fn.mockReset());
  Object.values(clients.category!).forEach((fn) => fn.mockReset());
  family().list.mockResolvedValue(page());
  clients.category!.list.mockResolvedValue(page());
  replaceMock.mockReset();
});

describe("TaxonomyPage", () => {
  it("lista las familias en una tabla con sus conteos y estado", async () => {
    renderPage();
    const open = await screen.findByRole("button", { name: "Florales, 6 estampas activas de 8" });
    const row = open.closest("tr") as HTMLElement;
    expect(within(row).getByText("6 de 8")).toBeInTheDocument();
    expect(within(row).getByText("Activa")).toBeInTheDocument();
    expect(within(row).getByText("Rosas y peonías")).toBeInTheDocument();
    expect(screen.getByText("Retirada")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Familias", level: 1 })).toBeInTheDocument();
  });

  it("las categorías usan su propio cliente y su vocabulario", async () => {
    renderPage(categoryConfig);
    await screen.findByRole("button", { name: /Florales, 6 modelos activos de 8/ });
    expect(screen.getByRole("heading", { name: "Categorías", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Nueva categoría/ })).toBeInTheDocument();
    expect(clients.category!.list).toHaveBeenCalled();
    expect(family().list).not.toHaveBeenCalled();
  });

  it("pide al API lo que dicen los filtros de la URL", async () => {
    renderPage(familyConfig, { estado: "retiradas", q: "lun", orden: "-updatedAt" });
    await screen.findByRole("button", { name: /Florales/ });
    const query = new URLSearchParams(family().list.mock.calls[0]?.[0] as string);
    expect(query.get("isActive")).toBe("false");
    expect(query.get("search")).toBe("lun");
    expect(query.get("sort")).toBe("-updatedAt");
  });

  it("cambiar un filtro escribe la URL en español", async () => {
    renderPage();
    await screen.findByRole("button", { name: /Florales/ });
    await userEvent.click(screen.getByRole("button", { name: "Retiradas" }));
    expect(replaceMock).toHaveBeenLastCalledWith("/familias?estado=retiradas", { scroll: false });
    await chooseOption(screen.getByRole("combobox", { name: "Ordenar por" }), "Actualizadas recientemente");
    expect(replaceMock).toHaveBeenLastCalledWith("/familias?estado=retiradas&orden=-updatedAt", { scroll: false });
  });

  it("abrir una fila escribe ?familia= y abre el modal", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /Florales/ }));
    expect(replaceMock).toHaveBeenLastCalledWith(`/familias?familia=${FAMILY_ID}`, { scroll: false });
    expect(within(screen.getByRole("dialog")).getByRole("heading", { name: "Florales" })).toBeInTheDocument();
  });

  it("«Nueva familia» abre el modal de crear y cerrarlo limpia la URL", async () => {
    renderPage();
    await screen.findByRole("button", { name: /Florales/ });
    await userEvent.click(screen.getByRole("button", { name: /Nueva familia/ }));
    expect(replaceMock).toHaveBeenLastCalledWith("/familias?familia=nueva", { scroll: false });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(replaceMock).toHaveBeenLastCalledWith("/familias", { scroll: false });
  });

  it("con ?familia=<id> en la URL abre el modal al cargar", async () => {
    family().get.mockResolvedValue(FLORALES);
    renderPage(familyConfig, { familia: FAMILY_ID });
    expect(await screen.findByRole("dialog", { name: "Florales" })).toBeInTheDocument();
  });

  it("hay un solo botón amarillo con el modal cerrado", async () => {
    renderPage();
    await screen.findByRole("button", { name: /Florales/ });
    expect(screen.getAllByRole("button", { name: /Nueva familia/ })).toHaveLength(1);
  });

  it("sin registros muestra el vacío con la forma de crear", async () => {
    family().list.mockResolvedValue(page([]));
    renderPage();
    expect(await screen.findByText("Todavía no hay familias")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Nueva familia/ })).toHaveLength(2);
  });

  it("sin coincidencias con filtros muestra «Limpiar filtros»", async () => {
    family().list.mockResolvedValue(page([]));
    renderPage(familyConfig, { q: "zzz" });
    expect(await screen.findByText("Ninguna familia coincide")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(replaceMock).toHaveBeenLastCalledWith("/familias", { scroll: false });
  });

  it("un error de carga muestra el aviso con «Reintentar»", async () => {
    family().list.mockRejectedValueOnce(new ApiError("Sin conexión.", "network"));
    renderPage();
    expect(await screen.findByText("No se pudieron cargar las familias")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("button", { name: /Florales/ })).toBeInTheDocument();
  });
});
