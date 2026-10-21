import { CouponStatus } from "@gira/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CouponsPage } from "@/components/coupons/CouponsPage";
import { ToastProvider } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/ApiError";
import { parseCouponFilters, parseSelectedCoupon } from "@/lib/coupons/filters";
import { chooseOption } from "../../helpers/select";
import { COUPON_2_ID, COUPON_ID, makePanelCoupon } from "../../helpers/coupons";

const client = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import("../../helpers/coupons").makeCouponClientMock> }));
vi.mock("@/lib/api/adminCoupons", async () => {
  const { makeCouponClientMock: make } = await import("../../helpers/coupons");
  client.current = make();
  return { couponClient: client.current };
});

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/cupones",
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), refresh: vi.fn() }),
}));

const mock = () => client.current!;
const VERANO = makePanelCoupon();
const VIEJO = makePanelCoupon({ id: COUPON_2_ID, code: "VIEJO2025", name: "Viejo", status: CouponStatus.EXPIRED });
const page = (items = [VERANO, VIEJO]) => ({ items, meta: { total: items.length, page: 1, pages: 1, limit: 20 } });

const renderPage = (params: Record<string, string> = {}) =>
  render(
    <ToastProvider>
      <CouponsPage initialFilters={parseCouponFilters(params)} initialSelected={parseSelectedCoupon(params)} />
    </ToastProvider>,
  );

beforeEach(() => {
  Object.values(mock()).forEach((fn) => {
    fn.mockReset();
  });
  mock().list.mockResolvedValue(page());
  replaceMock.mockReset();
});

describe("CouponsPage", () => {
  it("lista los cupones en una tabla con título y estado", async () => {
    renderPage();
    const open = await screen.findByRole("button", { name: "VERANO10, Verano" });
    expect(within(open.closest("tr") as HTMLElement).getByText("Activo")).toBeInTheDocument();
    expect(screen.getByText("Vencido")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cupones", level: 1 })).toBeInTheDocument();
  });

  it("pide al API lo que dicen los filtros de la URL", async () => {
    renderPage({ estado: "vencidos", q: "via", orden: "code" });
    await screen.findByRole("button", { name: /VERANO10/ });
    const query = new URLSearchParams(mock().list.mock.calls[0]?.[0] as string);
    expect(query.get("estado")).toBe("vencidos");
    expect(query.get("search")).toBe("via");
    expect(query.get("sort")).toBe("code");
  });

  it("cambiar un filtro escribe la URL en español", async () => {
    renderPage();
    await screen.findByRole("button", { name: /VERANO10/ });
    await chooseOption(screen.getByRole("combobox", { name: "Estado" }), "Retirados");
    expect(replaceMock).toHaveBeenLastCalledWith("/cupones?estado=retirados", { scroll: false });
    await chooseOption(screen.getByRole("combobox", { name: "Ordenar por" }), "Más canjeados");
    expect(replaceMock).toHaveBeenLastCalledWith("/cupones?estado=retirados&orden=-redeemedCount", { scroll: false });
  });

  it("abrir una fila escribe ?cupon= y abre el modal", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /VERANO10/ }));
    expect(replaceMock).toHaveBeenLastCalledWith(`/cupones?cupon=${COUPON_ID}`, { scroll: false });
    expect(await screen.findByRole("dialog", { name: "Editar cupón" })).toBeInTheDocument();
  });

  it("«Nuevo cupón» abre el modal de crear y cerrarlo limpia la URL", async () => {
    renderPage();
    await screen.findByRole("button", { name: /VERANO10/ });
    await userEvent.click(screen.getByRole("button", { name: /Nuevo cupón/ }));
    expect(replaceMock).toHaveBeenLastCalledWith("/cupones?cupon=nuevo", { scroll: false });
    expect(screen.getByRole("dialog", { name: "Nuevo cupón" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(replaceMock).toHaveBeenLastCalledWith("/cupones", { scroll: false });
  });

  it("con ?cupon=<id> en la URL abre el modal al cargar", async () => {
    mock().get.mockResolvedValue(VERANO);
    renderPage({ cupon: COUPON_ID });
    expect(await screen.findByRole("dialog", { name: "Editar cupón" })).toBeInTheDocument();
  });

  it("sin cupones muestra el vacío con la forma de crear", async () => {
    mock().list.mockResolvedValue(page([]));
    renderPage();
    expect(await screen.findByText("Aún no hay cupones")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Nuevo cupón/ })).toHaveLength(2);
  });

  it("sin coincidencias con filtros muestra «Limpiar filtros»", async () => {
    mock().list.mockResolvedValue(page([]));
    renderPage({ q: "zzz" });
    expect(await screen.findByText("Ningún cupón coincide")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(replaceMock).toHaveBeenLastCalledWith("/cupones", { scroll: false });
  });

  it("un error de carga muestra el aviso con «Reintentar» que vuelve a pedir la lista", async () => {
    mock().list.mockRejectedValueOnce(new ApiError("Sin conexión.", "network"));
    renderPage();
    expect(await screen.findByText("No se pudieron cargar los cupones")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("button", { name: /VERANO10/ })).toBeInTheDocument();
    expect(mock().list).toHaveBeenCalledTimes(2);
  });

  it("filtra por clase, escribe ?clase= y explica dónde se da un cupón personal", async () => {
    renderPage();
    await screen.findByRole("button", { name: /VERANO10/ });
    expect(screen.getByText("Para dar uno personal, entra a la cuenta del cliente.")).toBeInTheDocument();
    await chooseOption(screen.getByRole("combobox", { name: "Clase" }), "Personales");
    expect(replaceMock).toHaveBeenLastCalledWith("/cupones?clase=personales", { scroll: false });
    const query = new URLSearchParams(mock().list.mock.calls.at(-1)?.[0] as string);
    expect(query.get("clase")).toBe("personales");
  });
});
