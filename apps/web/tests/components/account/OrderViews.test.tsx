import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CustomerOrder, Wire } from "@gira/shared";
import { OrderDetailView } from "@/components/store/account/orders/OrderDetailView";
import { OrderRow } from "@/components/store/account/orders/OrderRow";
import { orderSummary } from "@/components/store/account/orders/orderSummary";

const LINE = { sku: "PLY-SOL-M", productName: "Playera Sol", printName: "Sol", qty: 2, unitPrice: 45000, lineTotal: 90000 };

const makeOrder = (overrides: Partial<Wire<CustomerOrder>> = {}): Wire<CustomerOrder> =>
  ({
    id: "68f2ab12c3d4e5f6a7b8c9d0",
    publicId: "PUBLIC",
    orderNumber: "GC-7K3Q9XPD",
    status: "shipped",
    customer: { email: "m@correo.mx", name: "María López" },
    shipping: { recipient: "María López", line1: "Calle 1 #2", district: "Centro", city: "Guadalajara", state: "Jalisco", postalCode: "44100", country: "MX" },
    lines: [LINE],
    currency: "MXN",
    subtotal: 90000,
    discount: 0,
    shippingCost: 0,
    tax: 12414,
    taxRateBps: 1600,
    total: 90000,
    createdAt: "2026-10-20T15:00:00.000Z",
    ...overrides,
  }) as Wire<CustomerOrder>;

type Shipment = NonNullable<Wire<CustomerOrder>["shipment"]>;
const shipmentWith = (trackUrl: string): Shipment => ({ carrier: "dhl", carrierName: "DHL", trackingNumber: "123456", trackUrl }) as Shipment;

describe("orderSummary", () => {
  it("un producto, varios y ninguno", () => {
    expect(orderSummary([LINE])).toBe("Playera Sol");
    expect(orderSummary([LINE, { ...LINE, productName: "Gorra" }, LINE])).toBe("Playera Sol y 2 más");
    expect(orderSummary([])).toBe("Sin productos");
  });
});

describe("OrderRow", () => {
  it("muestra folio, estado, resumen, total y enlaza al detalle por id interno", () => {
    render(<ul><OrderRow order={makeOrder()} /></ul>);
    expect(screen.getByText("GC-7K3Q9XPD")).toBeInTheDocument();
    expect(screen.getByText("enviado")).toBeInTheDocument();
    expect(screen.getByText("Playera Sol")).toBeInTheDocument();
    expect(screen.getByText("$900.00")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver detalle" })).toHaveAttribute("href", "/cuenta/pedidos/68f2ab12c3d4e5f6a7b8c9d0");
  });
});

describe("OrderDetailView", () => {
  it("envío gratis, sin fila de descuento y con IVA incluido", () => {
    render(<OrderDetailView order={makeOrder()} />);
    expect(screen.getByRole("heading", { level: 1, name: "GC-7K3Q9XPD" })).toBeInTheDocument();
    expect(screen.getByText("Gratis")).toBeInTheDocument();
    expect(screen.queryByText("Descuento")).toBeNull();
    expect(screen.getByText("IVA incluido")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Volver a mis pedidos/ })).toHaveAttribute("href", "/cuenta/pedidos");
  });

  it("con descuento y envío cobrado muestra ambas filas", () => {
    render(<OrderDetailView order={makeOrder({ discount: 5000, shippingCost: 9900, total: 94900 })} />);
    expect(screen.getByText("-$50.00")).toBeInTheDocument();
    expect(screen.getByText("$99.00")).toBeInTheDocument();
    expect(screen.getByText("$949.00")).toBeInTheDocument();
  });

  it("enviado: guía y enlace de rastreo que abre fuera con rel seguro", () => {
    const order = makeOrder({ shipment: shipmentWith("https://track.example/123456") });
    render(<OrderDetailView order={order} />);
    expect(screen.getByText("Guía 123456")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Rastrear paquete" });
    expect(link).toHaveAttribute("href", "https://track.example/123456");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("un trackUrl que no es http(s) no se vuelve enlace", () => {
    const order = makeOrder({ shipment: shipmentWith("javascript:alert(1)") });
    render(<OrderDetailView order={order} />);
    expect(screen.getByText("Guía 123456")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Rastrear paquete" })).toBeNull();
  });

  it("muestra la dirección de envío", () => {
    render(<OrderDetailView order={makeOrder()} />);
    const section = screen.getByRole("heading", { name: "Envío a" }).closest("section") as HTMLElement;
    expect(within(section).getByText("Calle 1 #2")).toBeInTheDocument();
    expect(within(section).getByText(/C\.P\. 44100/)).toBeInTheDocument();
  });
});
