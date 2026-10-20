import { OrderStatus, ShipmentTrackingStatus, ShippingLabelStatus } from "@gira/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LogisticsCard } from "@/components/orders/detail/LogisticsCard";
import { ToastProvider } from "@/components/ui/Toast";
import { makeOrder, orderOf, without } from "../helpers/orders";

const api = vi.hoisted(() => ({ getOrderTracking: vi.fn() }));
vi.mock("@/lib/api/adminOrders", () => api);

const handlers = () => ({ onPrepare: vi.fn(), onShip: vi.fn(), onRetryLabel: vi.fn().mockResolvedValue(true) });

const renderCard = (order = makeOrder(), extra: Partial<ReturnType<typeof handlers>> = {}) => {
  const fns = { ...handlers(), ...extra };
  render(
    <ToastProvider>
      <LogisticsCard order={order} busy={false} version={0} {...fns} />
    </ToastProvider>,
  );
  return fns;
};

const withLabel = (status: ShippingLabelStatus, extra: Record<string, unknown> = {}) => ({
  ...makeOrder().label!,
  status,
  ...extra,
});

beforeEach(() => {
  api.getOrderTracking.mockReset();
  api.getOrderTracking.mockResolvedValue({ events: [] });
});

describe("LogisticsCard: textos cuando no hay guía", () => {
  it("cancelado: este pedido no se enviará, sin botones de envío", () => {
    renderCard(without(orderOf(OrderStatus.CANCELLED), "label"));
    expect(screen.getByText("Este pedido no se enviará.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Marcar enviado" })).not.toBeInTheDocument();
  });

  it("pago pendiente: avisa que la guía llega con el pago", () => {
    renderCard(without(orderOf(OrderStatus.PENDING_PAYMENT), "label"));
    expect(screen.getByText("Disponible cuando se confirme el pago.")).toBeInTheDocument();
  });

  it("pagado sin guía: se puede pasar a en proceso", async () => {
    const fns = renderCard(without(orderOf(OrderStatus.PAID), "label"));
    await userEvent.click(screen.getByRole("button", { name: "Pasar a en proceso" }));
    expect(fns.onPrepare).toHaveBeenCalledTimes(1);
  });
});

describe("LogisticsCard: marcar enviado", () => {
  it("en proceso con guía lista: habilitado y llama onShip", async () => {
    const fns = renderCard(orderOf(OrderStatus.PROCESSING));
    const ship = screen.getByRole("button", { name: "Marcar enviado" });
    expect(ship).toBeEnabled();
    await userEvent.click(ship);
    expect(fns.onShip).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Sí, marcar enviado" }));
    expect(fns.onShip).toHaveBeenCalledTimes(1);
  });

  it("pagado con guía lista: deshabilitado y dice por qué", () => {
    renderCard(orderOf(OrderStatus.PAID));
    expect(screen.getByRole("button", { name: "Marcar enviado" })).toBeDisabled();
    expect(screen.getByText("Primero pásalo a en proceso.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pasar a en proceso" })).toBeEnabled();
  });

  it("en proceso con guía en cola: deshabilitado", () => {
    renderCard(orderOf(OrderStatus.PROCESSING, { label: withLabel(ShippingLabelStatus.PENDING, { trackingNumber: undefined }) }));
    expect(screen.getByRole("button", { name: "Marcar enviado" })).toBeDisabled();
    expect(screen.getByText("La guía todavía no está lista.")).toBeInTheDocument();
  });
});

describe("LogisticsCard: reintentar guía", () => {
  it("guía por revisar: pide confirmación con la advertencia de la segunda guía", async () => {
    const fns = renderCard(orderOf(OrderStatus.PROCESSING, { label: withLabel(ShippingLabelStatus.NEEDS_REVIEW, { trackingNumber: undefined, lastError: "La paquetería no respondió." }) }));
    expect(screen.getByText("La paquetería no respondió.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Reintentar guía" }));
    expect(fns.onRetryLabel).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveTextContent("Envía puede cobrar una segunda");

    await userEvent.click(screen.getByRole("button", { name: "Sí, reintentar" }));
    await waitFor(() => expect(fns.onRetryLabel).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("cancelar el diálogo no reintenta", async () => {
    const fns = renderCard(orderOf(OrderStatus.PAID, { label: withLabel(ShippingLabelStatus.NEEDS_REVIEW, { trackingNumber: undefined }) }));
    await userEvent.click(screen.getByRole("button", { name: "Reintentar guía" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(fns.onRetryLabel).not.toHaveBeenCalled();
  });

  it("guía con error: reintenta directo, sin advertencia", async () => {
    const fns = renderCard(orderOf(OrderStatus.PAID, { label: withLabel(ShippingLabelStatus.FAILED, { trackingNumber: undefined }) }));
    await userEvent.click(screen.getByRole("button", { name: "Reintentar guía" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fns.onRetryLabel).toHaveBeenCalledTimes(1);
  });

  it("guía lista: no hay botón de reintentar", () => {
    renderCard(orderOf(OrderStatus.PROCESSING));
    expect(screen.queryByRole("button", { name: "Reintentar guía" })).not.toBeInTheDocument();
  });
});

describe("LogisticsCard: guía, enlaces y rastreo", () => {
  it("muestra paquetería, servicio y guía, y copia la guía", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderCard(orderOf(OrderStatus.PROCESSING));
    expect(screen.getByText("DHL Express")).toBeInTheDocument();
    expect(screen.getByText("5012345678")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Copiar" }));
    expect(writeText).toHaveBeenCalledWith("5012345678");
    expect(await screen.findByText("Guía copiada")).toBeInTheDocument();
  });

  it("los enlaces https abren en pestaña nueva con noopener", () => {
    renderCard(orderOf(OrderStatus.PROCESSING));
    const track = screen.getByRole("link", { name: /Rastrear paquete/ });
    expect(track).toHaveAttribute("href", "https://track.example.com/5012345678");
    expect(track).toHaveAttribute("target", "_blank");
    expect(track).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: /Ver etiqueta/ })).toBeInTheDocument();
  });

  it("un enlace que no es https nunca se pinta", () => {
    renderCard(
      orderOf(OrderStatus.PROCESSING, {
        label: withLabel(ShippingLabelStatus.READY, { trackUrl: "javascript:alert(1)", labelUrl: "http://inseguro.example.com/x.pdf" }),
      }),
    );
    expect(screen.queryByRole("link", { name: /Rastrear paquete/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Ver etiqueta/ })).not.toBeInTheDocument();
  });

  it("una incidencia de rastreo muestra el aviso", () => {
    renderCard(
      orderOf(OrderStatus.SHIPPED, {
        tracking: { status: ShipmentTrackingStatus.EXCEPTION },
        shippedAt: "2026-10-18T10:00:00.000Z",
      }),
    );
    expect(screen.getByText("Hay un problema con el envío")).toBeInTheDocument();
    expect(screen.getAllByText("Incidencia en el envío").length).toBeGreaterThan(0);
  });

  it("la línea de tiempo lista los eventos del más reciente al más viejo", async () => {
    api.getOrderTracking.mockResolvedValue({
      events: [
        { status: ShipmentTrackingStatus.PICKED_UP, rawStatus: "picked", occurredAt: "2026-10-17T10:00:00.000Z", location: "CDMX" },
        { status: ShipmentTrackingStatus.IN_TRANSIT, rawStatus: "transit", occurredAt: "2026-10-18T10:00:00.000Z", description: "Llegó al centro de distribución" },
      ],
    });
    renderCard(orderOf(OrderStatus.SHIPPED, { shippedAt: "2026-10-17T12:00:00.000Z" }));
    const list = await screen.findByRole("list", { name: "Eventos de rastreo" });
    const items = Array.from(list.querySelectorAll("li")).map((li) => li.textContent ?? "");
    expect(items[0]).toContain("En tránsito");
    expect(items[1]).toContain("Recolectado");
    expect(screen.getByText("Llegó al centro de distribución")).toBeInTheDocument();
  });

  it("sin eventos dice que aún no hay rastreo", async () => {
    renderCard(orderOf(OrderStatus.SHIPPED, { shippedAt: "2026-10-17T12:00:00.000Z" }));
    expect(await screen.findByText("Aún no hay eventos de rastreo.")).toBeInTheDocument();
  });
});
