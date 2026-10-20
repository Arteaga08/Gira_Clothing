import { OrderStatus, ShippingLabelStatus } from "@gira/shared";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrderDetail } from "@/components/orders/detail/OrderDetail";
import { ToastProvider } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/ApiError";
import { DEFAULT_ID, makeOrder, orderOf, without, withoutIntent } from "../helpers/orders";

const api = vi.hoisted(() => ({
  updateOrderStatus: vi.fn(),
  updateOrderPriority: vi.fn(),
  updateShippingAddress: vi.fn(),
  markShipped: vi.fn(),
  requestRefund: vi.fn(),
  retryLabel: vi.fn(),
  fetchOrder: vi.fn(),
  getOrderTracking: vi.fn(),
  getOrderActivity: vi.fn(),
}));
vi.mock("@/lib/api/adminOrders", () => api);

const renderDetail = (order = makeOrder()) =>
  render(
    <ToastProvider>
      <OrderDetail initialOrder={order} />
    </ToastProvider>,
  );

beforeEach(() => {
  Object.values(api).forEach((mock) => mock.mockReset());
  api.getOrderTracking.mockResolvedValue({ events: [] });
  api.getOrderActivity.mockResolvedValue([
    { action: "payment_succeeded", actorType: "system", createdAt: "2026-10-19T15:15:00.000Z" },
    { action: "order_marked_shipped", actorType: "user", actorId: DEFAULT_ID, createdAt: "2026-10-19T16:00:00.000Z" },
  ]);
});

describe("OrderDetail: lectura", () => {
  it("muestra el folio, los artículos, los totales y el IVA incluido", () => {
    renderDetail();
    expect(screen.getByRole("heading", { name: "GC-7KQ3M2XV" })).toBeInTheDocument();
    expect(screen.getByText("Playera oversize · Cempasúchil")).toBeInTheDocument();
    expect(screen.getByText("Subtotal (IVA incluido)")).toBeInTheDocument();
    expect(screen.getByText("de los cuales IVA 16 %")).toBeInTheDocument();
    expect(screen.getByText("$1,120.00")).toBeInTheDocument();
  });

  it("nunca pinta el publicId ni el id interno como texto", async () => {
    renderDetail();
    await screen.findByText("Pago confirmado");
    expect(document.body.textContent).not.toContain("PUBLIC-ID-SECRETO");
    expect(document.body.textContent).not.toContain(DEFAULT_ID);
  });

  it("la actividad usa textos en español y dice Sistema o Equipo, nunca el id del actor", async () => {
    renderDetail();
    expect(await screen.findByText("Marcado como enviado")).toBeInTheDocument();
    expect(screen.getByText(/Sistema ·/)).toBeInTheDocument();
    expect(screen.getByText(/Equipo ·/)).toBeInTheDocument();
  });

  it("del pago solo se ve marca y últimos cuatro dígitos", () => {
    renderDetail();
    expect(screen.getByText("Visa ••••4242")).toBeInTheDocument();
  });
});

describe("OrderDetail: acciones", () => {
  it("pasar a en proceso actualiza el estado en pantalla sin recargar", async () => {
    api.updateOrderStatus.mockResolvedValue(orderOf(OrderStatus.PROCESSING));
    renderDetail(orderOf(OrderStatus.PAID));
    await userEvent.click(screen.getAllByRole("button", { name: "Pasar a en proceso" })[0]!);
    expect(api.updateOrderStatus).toHaveBeenCalledWith(DEFAULT_ID, "processing");
    await waitFor(() => expect(screen.getByRole("button", { name: "Marcar enviado" })).toBeEnabled());
    expect(screen.queryByRole("button", { name: "Pasar a en proceso" })).not.toBeInTheDocument();
  });

  it("marcar enviado llama a la API y muestra el estado enviado", async () => {
    api.markShipped.mockResolvedValue(orderOf(OrderStatus.SHIPPED, { shippedAt: "2026-10-19T17:00:00.000Z" }));
    renderDetail(orderOf(OrderStatus.PROCESSING));
    await userEvent.click(screen.getByRole("button", { name: "Marcar enviado" }));
    expect(api.markShipped).toHaveBeenCalledWith(DEFAULT_ID);
    expect(await screen.findByText("GC-7KQ3M2XV marcado como enviado")).toBeInTheDocument();
  });

  it("un 409 de la API se muestra tal cual y el pedido no cambia", async () => {
    const { ApiError } = await import("@/lib/api/ApiError");
    api.markShipped.mockRejectedValue(new ApiError("Hay una disputa de pago abierta.", "http", 409));
    renderDetail(orderOf(OrderStatus.PROCESSING));
    await userEvent.click(screen.getByRole("button", { name: "Marcar enviado" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Hay una disputa de pago abierta.");
    expect(screen.getByRole("button", { name: "Marcar enviado" })).toBeEnabled();
  });

  it("cambiar la prioridad es inline y llama a la API", async () => {
    api.updateOrderPriority.mockResolvedValue(makeOrder({ priority: "urgente" as never }));
    renderDetail();
    await userEvent.selectOptions(screen.getByLabelText("Prioridad"), "urgente");
    expect(api.updateOrderPriority).toHaveBeenCalledWith(DEFAULT_ID, "urgente");
    expect(await screen.findByText("Prioridad de GC-7KQ3M2XV: urgente")).toBeInTheDocument();
  });

  it("reintentar guía por revisar vuelve a leer el pedido tras confirmar", async () => {
    const { ShippingLabelStatus } = await import("@gira/shared");
    const needsReview = orderOf(OrderStatus.PROCESSING, {
      label: { ...makeOrder().label!, status: ShippingLabelStatus.NEEDS_REVIEW, trackingNumber: undefined as never },
    });
    api.retryLabel.mockResolvedValue("Reintentamos generar la guía.");
    api.fetchOrder.mockResolvedValue(orderOf(OrderStatus.PROCESSING));
    renderDetail(needsReview);
    await userEvent.click(screen.getByRole("button", { name: "Reintentar guía" }));
    await userEvent.click(screen.getByRole("button", { name: "Sí, reintentar" }));
    await waitFor(() => expect(api.retryLabel).toHaveBeenCalledWith(DEFAULT_ID));
    await waitFor(() => expect(api.fetchOrder).toHaveBeenCalledWith(DEFAULT_ID));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Reintentar guía" })).not.toBeInTheDocument());
  });
});

describe("OrderDetail: cancelar y reembolsar", () => {
  it("cancelar solo existe con el pago pendiente", () => {
    renderDetail(orderOf(OrderStatus.PAID));
    expect(screen.queryByRole("button", { name: "Cancelar pedido" })).not.toBeInTheDocument();
  });

  it("cancelar exige motivo de 5 caracteres y lo manda a la API", async () => {
    api.updateOrderStatus.mockResolvedValue(orderOf(OrderStatus.CANCELLED, { cancelReason: "El cliente lo pidió" }));
    renderDetail(without(orderOf(OrderStatus.PENDING_PAYMENT), "label"));
    await userEvent.click(screen.getByRole("button", { name: "Cancelar pedido" }));
    const dialog = screen.getByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Cancelar pedido" });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText("Motivo de la cancelación"), "El cliente lo pidió");
    await userEvent.click(confirm);
    expect(api.updateOrderStatus).toHaveBeenCalledWith(DEFAULT_ID, "cancelled", "El cliente lo pidió");
    expect(await screen.findByText("Motivo de cancelación:")).toBeInTheDocument();
  });

  it("el reembolso muestra el monto y aclara que lo confirma Stripe", async () => {
    api.requestRefund.mockResolvedValue(makeOrder());
    renderDetail();
    await userEvent.click(screen.getByRole("button", { name: "Solicitar reembolso total" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("$1,120.00");
    expect(dialog).toHaveTextContent("cuando Stripe lo confirme");
    await userEvent.click(within(dialog).getByRole("button", { name: "Reembolsar" }));
    expect(api.requestRefund).toHaveBeenCalledWith(DEFAULT_ID);
  });

  it("no hay botón de reembolso si ya se reembolsó o no se pagó", () => {
    renderDetail(withoutIntent(orderOf(OrderStatus.PENDING_PAYMENT)));
    expect(screen.queryByRole("button", { name: "Solicitar reembolso total" })).not.toBeInTheDocument();
  });
});

describe("OrderDetail: dirección", () => {
  it("corregir dirección abre el panel lateral y guarda", async () => {
    api.updateShippingAddress.mockResolvedValue(makeOrder());
    renderDetail(orderOf(OrderStatus.PAID));
    await userEvent.click(screen.getByRole("button", { name: "Corregir dirección" }));
    const panel = screen.getByRole("dialog", { name: "Corregir dirección" });
    await userEvent.click(within(panel).getByRole("button", { name: "Guardar dirección" }));
    expect(api.updateShippingAddress).toHaveBeenCalledWith(DEFAULT_ID, expect.objectContaining({ postalCode: "44160", country: "MX" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("enviado: la dirección ya no se puede corregir", () => {
    renderDetail(orderOf(OrderStatus.SHIPPED));
    expect(screen.queryByRole("button", { name: "Corregir dirección" })).not.toBeInTheDocument();
    expect(screen.getByText(/ya no se puede corregir/)).toBeInTheDocument();
  });
});

describe("OrderDetail: errores de la API en los diálogos", () => {
  it("si cancelar falla, el diálogo sigue abierto y el motivo escrito no se pierde", async () => {
    api.updateOrderStatus.mockRejectedValue(new ApiError("El pago acaba de confirmarse.", "http", 409));
    renderDetail(without(orderOf(OrderStatus.PENDING_PAYMENT), "label"));
    await userEvent.click(screen.getByRole("button", { name: "Cancelar pedido" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Motivo de la cancelación"), "El cliente lo pidió");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancelar pedido" }));
    expect(await screen.findByText("El pago acaba de confirmarse.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Motivo de la cancelación")).toHaveValue("El cliente lo pidió");
  });

  it("si el reembolso falla, el diálogo sigue abierto y no se marca como solicitado", async () => {
    api.requestRefund.mockRejectedValue(new ApiError("Stripe no respondió.", "http", 502));
    renderDetail();
    await userEvent.click(screen.getByRole("button", { name: "Solicitar reembolso total" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Reembolsar" }));
    expect(await screen.findByText("Stripe no respondió.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText(/Reembolso solicitado\./)).not.toBeInTheDocument();
  });

  it("tras solicitar el reembolso el botón desaparece y no invita a pedirlo dos veces", async () => {
    api.requestRefund.mockResolvedValue(makeOrder());
    renderDetail();
    await userEvent.click(screen.getByRole("button", { name: "Solicitar reembolso total" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Reembolsar" }));
    expect(await screen.findByText("Reembolso solicitado. Esperando la confirmación de Stripe.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Solicitar reembolso total" })).not.toBeInTheDocument();
    expect(api.requestRefund).toHaveBeenCalledTimes(1);
  });

  it("si reintentar la guía falla, el diálogo de advertencia sigue abierto", async () => {
    api.retryLabel.mockRejectedValue(new ApiError("La guía de este pedido no se puede reintentar en este estado.", "http", 409));
    const needsReview = orderOf(OrderStatus.PROCESSING, {
      label: { ...makeOrder().label!, status: ShippingLabelStatus.NEEDS_REVIEW, trackingNumber: undefined as never },
    });
    delete (needsReview.label as { trackingNumber?: string }).trackingNumber;
    renderDetail(needsReview);
    await userEvent.click(screen.getByRole("button", { name: "Reintentar guía" }));
    await userEvent.click(screen.getByRole("button", { name: "Sí, reintentar" }));
    expect(await screen.findByText(/no se puede reintentar en este estado/)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("OrderDetail: la guía en proceso se actualiza sola", () => {
  it("mientras la guía está en cola vuelve a leer el pedido y muestra la guía lista", async () => {
    vi.useFakeTimers();
    try {
      const pending = orderOf(OrderStatus.PROCESSING, { label: { status: ShippingLabelStatus.PENDING, attempts: 0 } });
      api.fetchOrder.mockResolvedValue(orderOf(OrderStatus.PROCESSING));
      renderDetail(pending);
      expect(screen.getByText(/La guía se está procesando/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Marcar enviado" })).toBeDisabled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(4100);
      });

      expect(api.fetchOrder).toHaveBeenCalledWith(DEFAULT_ID);
      expect(screen.queryByText(/La guía se está procesando/)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Marcar enviado" })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("deja de consultar cuando la guía se asienta y no consulta si ya está lista", async () => {
    vi.useFakeTimers();
    try {
      renderDetail(orderOf(OrderStatus.PROCESSING));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000);
      });
      expect(api.fetchOrder).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
