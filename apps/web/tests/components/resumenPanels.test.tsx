import { NotificationChannelKind, NotificationType, OrderStatus } from "@gira/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DistributionPanel } from "@/components/resumen/DistributionPanel";
import { LowStockPanel } from "@/components/resumen/LowStockPanel";
import { OutboxHealthPanel } from "@/components/resumen/OutboxHealthPanel";
import { TopProductsPanel } from "@/components/resumen/TopProductsPanel";

describe("DistributionPanel", () => {
  it("con datos, dibuja la barra y la leyenda", () => {
    render(
      <DistributionPanel byStatus={{ [OrderStatus.SHIPPED]: 14, [OrderStatus.PAID]: 8 }} />,
    );
    expect(screen.getByRole("img")).toBeInTheDocument();
    expect(screen.getByText("enviada")).toBeInTheDocument();
    expect(screen.getByText("pagada")).toBeInTheDocument();
  });

  it("con {} muestra el EmptyState", () => {
    render(<DistributionPanel byStatus={{}} />);
    expect(screen.getByText("Sin pedidos en el periodo")).toBeInTheDocument();
  });
});

describe("TopProductsPanel", () => {
  it("con datos, lista con rango numerado", () => {
    render(
      <TopProductsPanel
        products={[
          { sku: "PLY-CEMP-M", productName: "Playera oversize", printName: "Cempasúchil", units: 14 },
        ]}
      />,
    );
    expect(screen.getByText("Playera oversize · Cempasúchil")).toBeInTheDocument();
    expect(screen.getByText("PLY-CEMP-M")).toBeInTheDocument();
    expect(screen.getByText("14")).toBeInTheDocument();
  });

  it("con arreglo vacío, EmptyState y ninguna fila", () => {
    render(<TopProductsPanel products={[]} />);
    expect(screen.getByText("Aún no hay ventas en este periodo")).toBeInTheDocument();
    expect(screen.queryByText(/PLY-/)).not.toBeInTheDocument();
  });
});

describe("LowStockPanel", () => {
  it("con datos, SKU + subtítulo + chip con el disponible", () => {
    render(
      <LowStockPanel
        items={[{ id: "1", sku: "PLY-CEMP-XS", available: 0 }]}
        lowStockThreshold={3}
        outOfStock={1}
        lowStock={0}
      />,
    );
    expect(screen.getByText("PLY-CEMP-XS")).toBeInTheDocument();
    expect(screen.getByText("Agotada")).toBeInTheDocument();
    expect(screen.getByText("Umbral: 3 · 1 agotadas, 0 bajas")).toBeInTheDocument();
  });

  it("stock bajo (no agotado) muestra el subtítulo correspondiente", () => {
    render(
      <LowStockPanel
        items={[{ id: "1", sku: "GOR-NOPA-U", available: 2 }]}
        lowStockThreshold={3}
        outOfStock={0}
        lowStock={1}
      />,
    );
    expect(screen.getByText("GOR-NOPA-U").nextElementSibling).toHaveTextContent("Stock bajo");
  });

  it("con arreglo vacío, EmptyState", () => {
    render(<LowStockPanel items={[]} lowStockThreshold={3} outOfStock={0} lowStock={0} />);
    expect(screen.getByText("Todo el stock está por encima del umbral")).toBeInTheDocument();
  });
});

describe("OutboxHealthPanel", () => {
  const baseHealth = {
    pending: 3,
    sending: 0,
    failed: 0,
    sent: 214,
    stale: 0,
    oldestPendingAt: null,
    failedSample: [],
  };

  it("renderiza las tiles de la cola", () => {
    render(<OutboxHealthPanel health={baseHealth} />);
    expect(screen.getByText("214")).toBeInTheDocument();
    expect(screen.getByText("Enviadas")).toBeInTheDocument();
    expect(screen.getByText("Pendientes")).toBeInTheDocument();
    expect(screen.getByText("Fallidas")).toBeInTheDocument();
    expect(screen.queryByText("Estancadas")).not.toBeInTheDocument();
  });

  it("con failedSample, muestra el aviso con tipo/canal/intentos/último error", () => {
    render(
      <OutboxHealthPanel
        health={{
          ...baseHealth,
          failed: 1,
          failedSample: [
            {
              id: "1",
              channel: NotificationChannelKind.EMAIL,
              type: NotificationType.ORDER_SHIPPED,
              attempts: 5,
              lastError: "Recipient address rejected",
              updatedAt: "2026-07-29T23:10:00.000Z",
            },
          ],
        }}
      />,
    );
    expect(screen.getByText(/Recipient address rejected/)).toBeInTheDocument();
    expect(screen.getByText(/5 intentos/)).toBeInTheDocument();
  });

  it("sin failedSample, no muestra el aviso", () => {
    render(<OutboxHealthPanel health={baseHealth} />);
    expect(screen.queryByRole("status", { name: /intentos/ })).not.toBeInTheDocument();
  });
});
