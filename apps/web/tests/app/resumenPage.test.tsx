import { Currency, UserRole } from "@gira/shared";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ResumenPage from "@/app/(admin)/resumen/page";

const { getOverviewMock, getTimeseriesMock, getOutboxHealthMock, loadSessionMock } = vi.hoisted(() => ({
  getOverviewMock: vi.fn(),
  getTimeseriesMock: vi.fn(),
  getOutboxHealthMock: vi.fn(),
  loadSessionMock: vi.fn(),
}));

vi.mock("@/lib/api/stats", () => ({
  getOverview: getOverviewMock,
  getTimeseries: getTimeseriesMock,
  getOutboxHealth: getOutboxHealthMock,
}));
vi.mock("@/lib/api/session", () => ({ loadSession: loadSessionMock }));

const overviewFixture = (overrides?: { empty?: boolean }) => ({
  orders: {
    range: { from: "2026-06-30T06:00:00.000Z", to: "2026-07-29T23:59:59.000Z", days: 30 },
    period: {
      totalOrders: overrides?.empty ? 0 : 47,
      paidOrders: overrides?.empty ? 0 : 39,
      revenue: overrides?.empty
        ? []
        : [
            { currency: Currency.MXN, revenue: 3_417_500, orders: 36, averageTicket: 94_931 },
            { currency: Currency.USD, revenue: 41_400, orders: 3, averageTicket: 13_800 },
          ],
      totalMxnEquivalent: overrides?.empty ? 0 : 4_162_700,
      unitsSold: overrides?.empty ? 0 : 68,
      topProducts: overrides?.empty
        ? []
        : [{ sku: "PLY-CEMP-M", productName: "Playera oversize", printName: "Cempasúchil", units: 14 }],
      topPrints: overrides?.empty ? [] : [{ printName: "Cempasúchil", units: 14 }],
    },
    byStatus: overrides?.empty ? {} : { shipped: 14, paid: 8 },
    alerts: {
      awaitingPreparation: overrides?.empty ? 0 : 3,
      stuckInProcessing: overrides?.empty ? 0 : 2,
      inTransitTooLong: 0,
      disputed: 0,
      pendingPayment: overrides?.empty ? 0 : 5,
    },
  },
  inventory: {
    lowStockThreshold: 3,
    activeVariants: 12,
    outOfStock: overrides?.empty ? 0 : 2,
    lowStock: overrides?.empty ? 0 : 6,
    unitsOnHand: 400,
    unitsReserved: 6,
    unitsAvailable: 394,
    lowStockItems: overrides?.empty ? [] : [{ id: "1", sku: "PLY-CEMP-XS", available: 0 }],
  },
});

const timeseriesFixture = (days = 3, granularity: "day" | "week" | "month" | "year" = "day") => ({
  range: { from: "2026-07-27T06:00:00.000Z", to: "2026-07-29T23:59:59.000Z", days, timezone: "America/Mexico_City" },
  granularity,
  series: Array.from({ length: days }, (_, index) => ({
    periodStart: `2026-07-2${7 + index}`,
    orders: 0,
    unitsSold: 0,
    revenue: [],
  })),
});

const healthFixture = () => ({
  pending: 3,
  sending: 0,
  failed: 1,
  sent: 214,
  stale: 0,
  oldestPendingAt: null,
  failedSample: [],
});

const adminSession = {
  kind: "authenticated" as const,
  user: { id: "1", name: "Manuel", email: "m@gira.mx", role: UserRole.ADMIN, twoFactorEnabled: true, isActive: true },
};

const renderPage = async (searchParams: Record<string, string | string[]> = {}) => {
  const element = await ResumenPage({ searchParams: Promise.resolve(searchParams) });
  render(element);
};

describe("ResumenPage — camino feliz", () => {
  it("renderiza el h1, las 6 tiles, los 3 KPIs, la gráfica y los cinco paneles", async () => {
    getOverviewMock.mockResolvedValue(overviewFixture());
    getTimeseriesMock.mockResolvedValue(timeseriesFixture());
    getOutboxHealthMock.mockResolvedValue(healthFixture());
    loadSessionMock.mockResolvedValue(adminSession);

    await renderPage({ dias: "30" });

    expect(screen.getByRole("heading", { level: 1, name: "Resumen" })).toBeInTheDocument();
    expect(screen.getByText("Notificaciones fallidas")).toBeInTheDocument();
    expect(screen.getByText("Pedidos", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("Ingresos (equiv. MXN)")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Pedidos por día/ })).toBeInTheDocument();
    expect(screen.getByText("Distribución por estado")).toBeInTheDocument();
    expect(screen.getByText("Más vendidos")).toBeInTheDocument();
    expect(screen.getByText("Stock bajo")).toBeInTheDocument();
    expect(screen.getByText("Print más usado")).toBeInTheDocument();
    expect(screen.getByText("Salud de notificaciones")).toBeInTheDocument();
  });
});

describe("ResumenPage — rango y vista", () => {
  it("?dias=7 pasa 7 a los fetches y marca el enlace activo", async () => {
    getOverviewMock.mockResolvedValue(overviewFixture());
    getTimeseriesMock.mockResolvedValue(timeseriesFixture());
    getOutboxHealthMock.mockResolvedValue(healthFixture());
    loadSessionMock.mockResolvedValue(adminSession);

    await renderPage({ dias: "7" });

    expect(getOverviewMock).toHaveBeenCalledWith(7);
    expect(getTimeseriesMock).toHaveBeenCalledWith(7, "day");
    expect(screen.getByRole("link", { name: "7 d" })).toHaveAttribute("aria-current", "page");
  });

  it("?dias=abc cae al default (30) sin lanzar", async () => {
    getOverviewMock.mockResolvedValue(overviewFixture());
    getTimeseriesMock.mockResolvedValue(timeseriesFixture());
    getOutboxHealthMock.mockResolvedValue(healthFixture());
    loadSessionMock.mockResolvedValue(adminSession);

    await renderPage({ dias: "abc" });

    expect(getOverviewMock).toHaveBeenCalledWith(30);
    expect(getTimeseriesMock).toHaveBeenCalledWith(30, "day");
  });

  it("?vista=week resuelve la granularidad, marca el enlace activo y usa la whitelist de semana para dias", async () => {
    getOverviewMock.mockResolvedValue(overviewFixture());
    getTimeseriesMock.mockResolvedValue(timeseriesFixture(180, "week"));
    getOutboxHealthMock.mockResolvedValue(healthFixture());
    loadSessionMock.mockResolvedValue(adminSession);

    await renderPage({ dias: "180", vista: "week" });

    expect(getTimeseriesMock).toHaveBeenCalledWith(180, "week");
    expect(screen.getByRole("link", { name: "Semana" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "180 d" })).toHaveAttribute("aria-current", "page");
  });

  it("?vista=abc cae al default (day) sin lanzar", async () => {
    getOverviewMock.mockResolvedValue(overviewFixture());
    getTimeseriesMock.mockResolvedValue(timeseriesFixture());
    getOutboxHealthMock.mockResolvedValue(healthFixture());
    loadSessionMock.mockResolvedValue(adminSession);

    await renderPage({ vista: "abc" });

    expect(getTimeseriesMock).toHaveBeenCalledWith(30, "day");
  });
});

describe("ResumenPage — fallos aislados por sección", () => {
  it("falla timeseries: la gráfica es SectionError, los KPIs siguen", async () => {
    getOverviewMock.mockResolvedValue(overviewFixture());
    getTimeseriesMock.mockRejectedValue(new Error("timeseries caído"));
    getOutboxHealthMock.mockResolvedValue(healthFixture());
    loadSessionMock.mockResolvedValue(adminSession);

    await renderPage({ dias: "30" });

    expect(screen.queryByRole("img", { name: /Pedidos por día/ })).not.toBeInTheDocument();
    expect(screen.getByText("Ingresos (equiv. MXN)")).toBeInTheDocument();
  });

  it("falla health: la banda muestra 5 tiles y el panel de salud es SectionError", async () => {
    getOverviewMock.mockResolvedValue(overviewFixture());
    getTimeseriesMock.mockResolvedValue(timeseriesFixture());
    getOutboxHealthMock.mockRejectedValue(new Error("health caído"));
    loadSessionMock.mockResolvedValue(adminSession);

    await renderPage({ dias: "30" });

    expect(screen.queryByText("Notificaciones fallidas")).not.toBeInTheDocument();
    expect(screen.getByText("Pagadas sin preparar (+24 h)")).toBeInTheDocument();
    expect(screen.queryByText("Salud de notificaciones")).not.toBeInTheDocument();
  });

  it("falla overview: KPIs, banda, distribución y las tres listas son SectionError; la gráfica sigue", async () => {
    getOverviewMock.mockRejectedValue(new Error("overview caído"));
    getTimeseriesMock.mockResolvedValue(timeseriesFixture());
    getOutboxHealthMock.mockResolvedValue(healthFixture());
    loadSessionMock.mockResolvedValue(adminSession);

    await renderPage({ dias: "30" });

    expect(screen.queryByText("Pedidos", { selector: "p" })).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Pedidos por día/ })).toBeInTheDocument();
    expect(screen.queryByText("Distribución por estado")).not.toBeInTheDocument();
    expect(screen.queryByText("Más vendidos")).not.toBeInTheDocument();
    expect(screen.queryByText("Stock bajo")).not.toBeInTheDocument();
    expect(screen.queryByText("Print más usado")).not.toBeInTheDocument();
    expect(screen.getAllByText("No se pudo cargar esta sección").length).toBeGreaterThanOrEqual(5);
  });
});

describe("ResumenPage — base vacía", () => {
  it("ceros en los KPIs y EmptyState en los cinco paneles, sin NaN en el DOM", async () => {
    getOverviewMock.mockResolvedValue(overviewFixture({ empty: true }));
    getTimeseriesMock.mockResolvedValue(timeseriesFixture());
    getOutboxHealthMock.mockResolvedValue({
      pending: 0,
      sending: 0,
      failed: 0,
      sent: 0,
      stale: 0,
      oldestPendingAt: null,
      failedSample: [],
    });
    loadSessionMock.mockResolvedValue(adminSession);

    await renderPage({ dias: "30" });

    expect(within(document.body).queryByText(/NaN/)).not.toBeInTheDocument();
    expect(screen.getByText("Sin pedidos en el periodo")).toBeInTheDocument();
    expect(screen.getByText("Aún no hay ventas en este periodo")).toBeInTheDocument();
    expect(screen.getByText("Aún no hay prints vendidos en este periodo")).toBeInTheDocument();
    expect(screen.getByText("Todo el stock está por encima del umbral")).toBeInTheDocument();
  });
});
