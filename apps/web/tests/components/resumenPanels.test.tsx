import { NotificationChannelKind, NotificationType, OrderStatus } from "@gira/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DistributionPanel } from "@/components/resumen/DistributionPanel";
import { LowStockPanel } from "@/components/resumen/LowStockPanel";
import { OutboxHealthPanel } from "@/components/resumen/OutboxHealthPanel";
import { TopPrintsPanel } from "@/components/resumen/TopPrintsPanel";

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

describe("TopPrintsPanel", () => {
  it("con datos, lista con rango numerado por print (sin SKU)", () => {
    render(<TopPrintsPanel prints={[{ printName: "Cempasúchil", units: 76 }]} />);
    expect(screen.getByText("Cempasúchil")).toBeInTheDocument();
    expect(screen.getByText("76")).toBeInTheDocument();
  });

  it("con arreglo vacío, EmptyState y ninguna fila", () => {
    render(<TopPrintsPanel prints={[]} />);
    expect(screen.getByText(/Aún no hay prints/)).toBeInTheDocument();
    expect(screen.queryByText("Cempasúchil")).not.toBeInTheDocument();
  });
});

describe("LowStockPanel", () => {
  it("con datos, nombre del producto + SKU + subtítulo + chip con el disponible", () => {
    render(
      <LowStockPanel
        items={[{ id: "1", sku: "PLY-CEMP-XS", productName: "Playera oversize", available: 0 }]}
        lowStockThreshold={3}
        outOfStock={1}
        lowStock={0}
      />,
    );
    expect(screen.getByText("Playera oversize")).toBeInTheDocument();
    expect(screen.getByText("PLY-CEMP-XS")).toBeInTheDocument();
    expect(screen.getByText("Agotada")).toBeInTheDocument();
    expect(screen.getByText("Umbral: 3 · 1 agotadas, 0 bajas")).toBeInTheDocument();
  });

  it("el nombre del producto es el título; el SKU queda como subtítulo en mono", () => {
    render(
      <LowStockPanel
        items={[{ id: "1", sku: "PLY-CEMP-XS", productName: "Playera oversize", available: 0 }]}
        lowStockThreshold={3}
        outOfStock={1}
        lowStock={0}
      />,
    );
    const title = screen.getByText("Playera oversize");
    const sku = screen.getByText("PLY-CEMP-XS");
    expect(title.tagName).toBe("P");
    expect(sku.nextElementSibling).toHaveTextContent("Agotada");
  });

  it("stock bajo (no agotado) muestra el subtítulo correspondiente", () => {
    render(
      <LowStockPanel
        items={[{ id: "1", sku: "GOR-NOPA-U", productName: "Gorra bordada", available: 2 }]}
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
