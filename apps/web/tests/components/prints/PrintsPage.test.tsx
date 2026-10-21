import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrintsPage } from "@/components/prints/PrintsPage";
import { ToastProvider } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/ApiError";
import { parsePrintFilters, parseSelectedPrint } from "@/lib/prints/filters";
import { chooseOption } from "../../helpers/select";
import { FAMILY_A_ID, PRINT_2_ID, PRINT_ID, makePanelPrint } from "../../helpers/prints";

const prints = vi.hoisted(() => ({ listPrints: vi.fn(), getPrint: vi.fn() }));
vi.mock("@/lib/api/adminPrints", () => prints);
const catalog = vi.hoisted(() => ({ fetchFamilyOptions: vi.fn() }));
vi.mock("@/lib/api/adminCatalog", () => catalog);

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/estampas",
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), refresh: vi.fn() }),
}));

const ROSAS = makePanelPrint();
const OLAS = makePanelPrint({
  id: PRINT_2_ID,
  name: "Olas lila",
  sku: "GEO-004",
  isActive: false,
  variantCount: 0,
  activeVariantCount: 0,
  activeProducts: [],
});

const page = (items = [ROSAS, OLAS]) => ({ prints: items, meta: { total: items.length, page: 1, pages: 1, limit: 24 } });

const renderPage = (params: Record<string, string> = {}) =>
  render(
    <ToastProvider>
      <PrintsPage initialFilters={parsePrintFilters(params)} initialSelected={parseSelectedPrint(params)} />
    </ToastProvider>,
  );

beforeEach(() => {
  prints.listPrints.mockReset().mockResolvedValue(page());
  prints.getPrint.mockReset();
  catalog.fetchFamilyOptions.mockReset().mockResolvedValue([{ value: FAMILY_A_ID, label: "Florales" }]);
  replaceMock.mockReset();
});

describe("PrintsPage", () => {
  it("lista las estampas como tarjetas", async () => {
    renderPage();
    expect(await screen.findByRole("button", { name: "Rosas de verano, FLR-001, 6 variantes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Olas lila/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Estampas", level: 1 })).toBeInTheDocument();
  });

  it("pide al API lo que dicen los filtros de la URL", async () => {
    renderPage({ familia: FAMILY_A_ID, estado: "retiradas", q: "rosa", orden: "sku" });
    await screen.findByRole("button", { name: /Rosas/ });
    const query = new URLSearchParams(prints.listPrints.mock.calls[0]?.[0] as string);
    expect(query.get("family")).toBe(FAMILY_A_ID);
    expect(query.get("isActive")).toBe("false");
    expect(query.get("search")).toBe("rosa");
    expect(query.get("sort")).toBe("sku");
  });

  it("cambiar un filtro escribe la URL en español", async () => {
    renderPage();
    await screen.findByRole("button", { name: /Rosas/ });
    await userEvent.click(screen.getByRole("button", { name: "Retiradas" }));
    expect(replaceMock).toHaveBeenLastCalledWith("/estampas?estado=retiradas", { scroll: false });
    await chooseOption(screen.getByRole("combobox", { name: "Ordenar por" }), "SKU");
    expect(replaceMock).toHaveBeenLastCalledWith("/estampas?estado=retiradas&orden=sku", { scroll: false });
  });

  it("abrir una tarjeta escribe ?estampa= y abre el panel", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /Rosas/ }));
    expect(replaceMock).toHaveBeenLastCalledWith(`/estampas?estampa=${PRINT_ID}`, { scroll: false });
    expect(within(screen.getByRole("dialog")).getByRole("heading", { name: "Rosas de verano" })).toBeInTheDocument();
  });

  it("«Nueva estampa» abre el panel de crear y cerrarlo limpia la URL", async () => {
    renderPage();
    await screen.findByRole("button", { name: /Rosas/ });
    await userEvent.click(screen.getByRole("button", { name: /Nueva estampa/ }));
    expect(replaceMock).toHaveBeenLastCalledWith("/estampas?estampa=nueva", { scroll: false });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(replaceMock).toHaveBeenLastCalledWith("/estampas", { scroll: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("con ?estampa= en la URL el panel abre al cargar, sin esperar a la lista", async () => {
    prints.getPrint.mockResolvedValue(ROSAS);
    renderPage({ estampa: PRINT_ID });
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(await within(screen.getByRole("dialog")).findByLabelText("Nombre")).toHaveValue("Rosas de verano");
  });

  it("un ?estampa= inválido no abre nada", async () => {
    renderPage({ estampa: "no-es-un-id" });
    await screen.findByRole("button", { name: /Rosas/ });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("muestra el esqueleto mientras carga", () => {
    prints.listPrints.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it("sin estampas y sin filtros invita a crear la primera", async () => {
    prints.listPrints.mockResolvedValue(page([]));
    renderPage();
    expect(await screen.findByText("Todavía no hay estampas")).toBeInTheDocument();
  });

  it("sin resultados con filtros ofrece limpiarlos", async () => {
    prints.listPrints.mockResolvedValue(page([]));
    renderPage({ q: "zzz" });
    await userEvent.click(await screen.findByRole("button", { name: "Limpiar filtros" }));
    expect(replaceMock).toHaveBeenLastCalledWith("/estampas", { scroll: false });
  });

  it("un error de carga ofrece reintentar", async () => {
    prints.listPrints.mockRejectedValueOnce(new ApiError("Sin conexión.", "network"));
    renderPage();
    expect(await screen.findByText("Sin conexión.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("button", { name: /Rosas/ })).toBeInTheDocument();
  });

  it("un refresco que falla deja las tarjetas y avisa", async () => {
    renderPage();
    await screen.findByRole("button", { name: /Rosas/ });
    prints.listPrints.mockRejectedValueOnce(new ApiError("Falló.", "network"));
    await userEvent.click(screen.getByRole("button", { name: "Retiradas" }));
    await waitFor(() => expect(prints.listPrints).toHaveBeenCalledTimes(2));
  });
});
