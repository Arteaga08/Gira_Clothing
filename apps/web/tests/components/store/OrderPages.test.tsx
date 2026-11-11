import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrderStatus, type CustomerOrder, type PublicOrder, type Wire } from "@gira/shared";
import { OrderDetailView } from "@/components/store/account/orders/OrderDetailView";
import { OrderResult } from "@/components/store/order/OrderResult";
import { ApiError } from "@/lib/api/ApiError";
import { CART_CHANGED_EVENT } from "@/lib/cart/guestCart";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const polling = vi.hoisted(() => ({ phase: "polling" as "polling" | "timed-out" }));
const api = vi.hoisted(() => ({ payMyOrder: vi.fn(), cancelMyOrder: vi.fn() }));
const payment = vi.hoisted(() => ({ last: undefined as undefined | { amount: number; payLabel: string; canPay: boolean; prepare: () => Promise<unknown>; onPaid: (id: string) => void } }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/hooks/usePaymentPolling", () => ({ usePaymentPolling: () => polling.phase }));
vi.mock("@/lib/api/orders", () => ({ payMyOrder: api.payMyOrder, cancelMyOrder: api.cancelMyOrder }));
vi.mock("@/components/store/checkout/PaymentSection", () => ({
  PaymentSection: (props: NonNullable<typeof payment.last>) => {
    payment.last = props;
    return <div data-testid="payment-section">{props.payLabel}</div>;
  },
}));

const PUBLIC_ID = "p".repeat(43);

const makeOrder = (overrides: Partial<Wire<CustomerOrder>> = {}): Wire<CustomerOrder> =>
  ({
    id: "68f2ab12c3d4e5f6a7b8c9d0",
    publicId: PUBLIC_ID,
    orderNumber: "GC-7K3Q9XPD",
    status: OrderStatus.PAID,
    customer: { email: "emilio@correo.mx", name: "Emilio Díaz" },
    shipping: { recipient: "Emilio Díaz", line1: "Calle Pino 214", district: "Roma Norte", city: "CDMX", state: "CMX", postalCode: "06700", country: "MX" },
    shippingSelection: { carrier: "estafeta", serviceName: "Terrestre", estimatedDays: 4 },
    lines: [{ sku: "PLY-M", productName: "Playera boxy", printName: "Selva", qty: 2, unitPrice: 54900, lineTotal: 109800 }],
    currency: "MXN",
    subtotal: 109800,
    discount: 10980,
    shippingCost: 8900,
    coupon: { code: "GIRA10", discountType: "percent", value: 10 },
    tax: 0,
    taxRateBps: 1600,
    total: 107720,
    createdAt: "2026-10-28T15:00:00.000Z",
    ...overrides,
  }) as Wire<CustomerOrder>;

beforeEach(() => {
  router.push.mockReset();
  router.refresh.mockReset();
  Object.values(api).forEach((fn) => fn.mockReset());
  polling.phase = "polling";
  payment.last = undefined;
});

describe("OrderResult (/orden/[publicId])", () => {
  it("pagado: «Gracias por tu compra» con líneas, cupón, envío, total y dirección", () => {
    render(<OrderResult order={makeOrder() as Wire<PublicOrder>} />);
    expect(screen.getByRole("heading", { name: "Gracias por tu compra" })).toBeInTheDocument();
    expect(screen.getByText("Te enviamos el comprobante a emilio@correo.mx.")).toBeInTheDocument();
    expect(screen.getByText("Playera boxy")).toBeInTheDocument();
    expect(screen.getByText("Descuento (GIRA10)")).toBeInTheDocument();
    expect(screen.getAllByText("$1,077.20").length).toBeGreaterThan(0);
    expect(screen.getByText("Calle Pino 214")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Seguir comprando" })).toHaveAttribute("href", "/tienda");
  });

  it("pagado: avisa al contador del carrito (el API lo vació al confirmar el pago)", () => {
    const changed = vi.fn();
    window.addEventListener(CART_CHANGED_EVENT, changed);
    render(<OrderResult order={makeOrder() as Wire<PublicOrder>} />);
    expect(changed).toHaveBeenCalled();
    window.removeEventListener(CART_CHANGED_EVENT, changed);
  });

  it("enviado y entregado también cuentan como pagados", () => {
    for (const status of [OrderStatus.PROCESSING, OrderStatus.SHIPPED, OrderStatus.DELIVERED]) {
      const { unmount } = render(<OrderResult order={makeOrder({ status }) as Wire<PublicOrder>} />);
      expect(screen.getByRole("heading", { name: "Gracias por tu compra" })).toBeInTheDocument();
      unmount();
    }
  });

  it("pendiente: «Confirmando tu pago…» y NUNCA lo marca como pagado ni avisa al carrito", () => {
    const changed = vi.fn();
    window.addEventListener(CART_CHANGED_EVENT, changed);
    render(<OrderResult order={makeOrder({ status: OrderStatus.PENDING_PAYMENT }) as Wire<PublicOrder>} />);
    expect(screen.getByRole("heading", { name: "Confirmando tu pago…" })).toBeInTheDocument();
    expect(screen.queryByText("Gracias por tu compra")).toBeNull();
    expect(changed).not.toHaveBeenCalled();
    window.removeEventListener(CART_CHANGED_EVENT, changed);
  });

  it("pendiente y sin respuesta tras los intentos: «Tu banco aún no confirma…»", () => {
    polling.phase = "timed-out";
    render(<OrderResult order={makeOrder({ status: OrderStatus.PENDING_PAYMENT }) as Wire<PublicOrder>} />);
    expect(screen.getByText("Tu banco aún no confirma el pago")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Ver mis pedidos" })[0]).toHaveAttribute("href", "/cuenta/pedidos");
  });

  it("cancelado y vencido explican qué pasó y no muestran el envío", () => {
    const { unmount } = render(<OrderResult order={makeOrder({ status: OrderStatus.CANCELLED }) as Wire<PublicOrder>} />);
    expect(screen.getByRole("heading", { name: "Este pedido se canceló" })).toBeInTheDocument();
    expect(screen.queryByText("Envío a")).toBeNull();
    unmount();
    render(<OrderResult order={makeOrder({ status: OrderStatus.EXPIRED }) as Wire<PublicOrder>} />);
    expect(screen.getByRole("heading", { name: "Este pedido venció" })).toBeInTheDocument();
  });
});

describe("OrderDetailView con pedido pendiente (Mis pedidos)", () => {
  const pending = () => makeOrder({ status: OrderStatus.PENDING_PAYMENT });

  it("un pedido pagado no ofrece pagar ni cancelar", () => {
    render(<OrderDetailView order={makeOrder()} />);
    expect(screen.queryByRole("button", { name: "Pagar pedido" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancelar pedido" })).toBeNull();
  });

  it("un pedido por pagar ofrece «Pagar pedido» y «Cancelar pedido»", () => {
    render(<OrderDetailView order={pending()} />);
    expect(screen.getByRole("heading", { name: "Este pedido está por pagar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pagar pedido" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar pedido" })).toBeInTheDocument();
  });

  it("«Pagar pedido» monta el Element con el total del pedido, enfoca su encabezado y devuelve el foco al cerrar", async () => {
    render(<OrderDetailView order={pending()} />);
    await userEvent.click(screen.getByRole("button", { name: "Pagar pedido" }));

    expect(screen.getByTestId("payment-section")).toHaveTextContent("Pagar $1,077.20");
    expect(payment.last).toMatchObject({ amount: 107720, canPay: true });
    expect(screen.getByRole("heading", { name: "Paga con tarjeta" })).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Pagar pedido" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.getByRole("heading", { name: "Este pedido está por pagar" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Pagar pedido" })).toBeInTheDocument();
  });

  it("pagar pide el secreto del MISMO pedido (no crea otro) y al pagar va a /orden/[publicId]", async () => {
    api.payMyOrder.mockResolvedValue({ order: { publicId: PUBLIC_ID }, clientSecret: "pi_secret" });
    render(<OrderDetailView order={pending()} />);
    await userEvent.click(screen.getByRole("button", { name: "Pagar pedido" }));

    await expect(payment.last!.prepare()).resolves.toMatchObject({ ok: true, clientSecret: "pi_secret" });
    expect(api.payMyOrder).toHaveBeenCalledWith("68f2ab12c3d4e5f6a7b8c9d0");

    act(() => payment.last!.onPaid(PUBLIC_ID));
    expect(router.push).toHaveBeenCalledWith(`/orden/${PUBLIC_ID}`);
  });

  it("cancelar pide confirmación, cancela, refresca la pantalla y avisa al contador", async () => {
    api.cancelMyOrder.mockResolvedValue({ id: "x" });
    const changed = vi.fn();
    window.addEventListener(CART_CHANGED_EVENT, changed);
    render(<OrderDetailView order={pending()} />);

    await userEvent.click(screen.getByRole("button", { name: "Cancelar pedido" }));
    expect(api.cancelMyOrder).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveTextContent("GC-7K3Q9XPD");

    await userEvent.click(screen.getByRole("button", { name: "Sí, cancelar pedido" }));
    await waitFor(() => expect(api.cancelMyOrder).toHaveBeenCalledWith("68f2ab12c3d4e5f6a7b8c9d0"));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(changed).toHaveBeenCalled();
    window.removeEventListener(CART_CHANGED_EVENT, changed);
  });

  it("cancelar libera la clave de idempotencia del checkout (el API devolvería el pedido cancelado)", async () => {
    api.cancelMyOrder.mockResolvedValue({ id: "x" });
    window.sessionStorage.setItem("gira:checkout-key:v1", JSON.stringify({ fingerprint: "f", key: "k", at: Date.now() }));
    render(<OrderDetailView order={pending()} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancelar pedido" }));
    await userEvent.click(screen.getByRole("button", { name: "Sí, cancelar pedido" }));
    await waitFor(() => expect(api.cancelMyOrder).toHaveBeenCalled());
    expect(window.sessionStorage.getItem("gira:checkout-key:v1")).toBeNull();
  });

  it("si el pedido ya no estaba por pagar (409) lo dice en el diálogo y refresca para mostrar el estado real", async () => {
    api.cancelMyOrder.mockRejectedValue(new ApiError("Este pedido ya no está por pagar.", "http", 409));
    render(<OrderDetailView order={pending()} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancelar pedido" }));
    await userEvent.click(screen.getByRole("button", { name: "Sí, cancelar pedido" }));

    expect(await screen.findByText("Este pedido ya no está por pagar.")).toBeInTheDocument();
    expect(router.refresh).toHaveBeenCalled();
  });
});
