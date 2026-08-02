import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AttentionBand } from "@/components/resumen/AttentionBand";
import type { AttentionTile } from "@/lib/stats/attention";

const tiles: AttentionTile[] = [
  { key: "awaitingPreparation", label: "Pagadas sin preparar (+24 h)", count: 3, level: "warn" },
  { key: "stuckInProcessing", label: "Atoradas en preparación (+72 h)", count: 2, level: "danger" },
  { key: "inTransitTooLong", label: "En tránsito demasiado tiempo (+14 d)", count: 1, level: "warn" },
  { key: "disputed", label: "En disputa", count: 0, level: "clear" },
  { key: "pendingPayment", label: "Pendientes de pago (flujo normal)", count: 5, level: "clear" },
  { key: "failedNotifications", label: "Notificaciones fallidas", count: 1, level: "danger" },
];

describe("AttentionBand", () => {
  it("renderiza una tile por entrada, con su nivel en data-level", () => {
    render(<AttentionBand tiles={tiles} />);
    const tile = screen.getByText("Pagadas sin preparar (+24 h)").closest("[data-level]");
    expect(tile).toHaveAttribute("data-level", "warn");
  });

  it("el conteo va en cada tile", () => {
    render(<AttentionBand tiles={tiles} />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("la sección tiene el h2 Requiere atención", () => {
    render(<AttentionBand tiles={tiles} />);
    expect(screen.getByRole("heading", { name: "Requiere atención" })).toBeInTheDocument();
  });

  it("con 5 tiles (sin salud) renderiza solo 5", () => {
    render(<AttentionBand tiles={tiles.slice(0, 5)} />);
    expect(screen.queryByText("Notificaciones fallidas")).not.toBeInTheDocument();
  });
});
