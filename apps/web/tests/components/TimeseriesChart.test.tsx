import { Currency } from "@gira/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TimeseriesChart } from "@/components/resumen/TimeseriesChart";
import { stubFetch } from "../helpers/fetchMock";

const point = (day: string, orders: number, unitsSold: number, mxnRevenue = 0) => ({
  day,
  orders,
  unitsSold,
  revenue: [{ currency: Currency.MXN, revenue: mxnRevenue, orders, averageTicket: 0 }],
});

const series = [
  point("2026-07-01", 2, 4, 10_000),
  point("2026-07-02", 0, 0, 0),
  point("2026-07-03", 5, 8, 50_000),
];

describe("TimeseriesChart", () => {
  it("renderiza exactamente series.length barras; los días en cero llevan data-zero", () => {
    render(<TimeseriesChart series={series} rangeDays={3} timezone="America/Mexico_City" />);
    const bars = document.querySelectorAll("[data-bar]");
    expect(bars).toHaveLength(3);
    expect(bars[1]).toHaveAttribute("data-zero", "true");
  });

  it('el contenedor es role="img" con aria-label describiendo el total y el máximo', () => {
    render(<TimeseriesChart series={series} rangeDays={3} timezone="America/Mexico_City" />);
    const chart = screen.getByRole("img");
    expect(chart.getAttribute("aria-label")).toMatch(/total 7/i);
    expect(chart.getAttribute("aria-label")).toMatch(/máximo 5/i);
  });

  it("click en «Ingresos» cambia la leyenda sin llamar a fetch", async () => {
    const fetchMock = stubFetch();
    const user = userEvent.setup();
    render(<TimeseriesChart series={series} rangeDays={3} timezone="America/Mexico_City" />);

    await user.click(screen.getByRole("button", { name: "Ingresos" }));

    expect(screen.getByText(/Ingresos MXN/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("aria-pressed está en uno y solo uno de los tres botones", () => {
    render(<TimeseriesChart series={series} rangeDays={3} timezone="America/Mexico_City" />);
    const pressed = ["Pedidos", "Ingresos", "Unidades"].map((label) =>
      screen.getByRole("button", { name: label }).getAttribute("aria-pressed"),
    );
    expect(pressed.filter((value) => value === "true")).toHaveLength(1);
  });

  it("serie toda en cero: sin NaN en ningún style y la leyenda dice Total 0", () => {
    const allZero = [point("2026-07-01", 0, 0, 0), point("2026-07-02", 0, 0, 0)];
    render(<TimeseriesChart series={allZero} rangeDays={2} timezone="America/Mexico_City" />);
    document.querySelectorAll("[data-bar]").forEach((bar) => {
      expect((bar as HTMLElement).style.height).not.toMatch(/NaN/);
    });
    expect(screen.getByText(/Total 0/)).toBeInTheDocument();
  });

  it("el eje es aria-hidden", () => {
    render(<TimeseriesChart series={series} rangeDays={3} timezone="America/Mexico_City" />);
    expect(document.querySelector("[data-chart-axis]")).toHaveAttribute("aria-hidden", "true");
  });
});
