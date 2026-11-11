import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CartLineStatus, type SavedAddress, type Wire } from "@gira/shared";
import { CheckoutFlow } from "@/components/store/checkout/CheckoutFlow";
import { ApiError } from "@/lib/api/ApiError";

const api = vi.hoisted(() => ({ previewOrder: vi.fn(), createOrder: vi.fn(), quoteCartShipping: vi.fn() }));
vi.mock("@/lib/api/orders", () => ({ previewOrder: api.previewOrder, createOrder: api.createOrder }));
vi.mock("@/lib/api/shipping", () => ({ quoteCartShipping: api.quoteCartShipping }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

// The real Payment Element is covered in PaymentFields.test; here only what the flow hands it.
const paymentProps = vi.hoisted(() => ({ last: undefined as undefined | { canPay: boolean; amount: number; payLabel: string; prepare: () => Promise<unknown> } }));
vi.mock("@/components/store/checkout/PaymentSection", () => ({
  PaymentSection: (props: { canPay: boolean; amount: number; payLabel: string; prepare: () => Promise<unknown> }) => {
    paymentProps.last = props;
    return (
      <button type="button" aria-disabled={!props.canPay} onClick={() => void props.prepare()}>
        {props.payLabel}
      </button>
    );
  },
}));

const A = "6ad9245c612875b3a4962bb1";
const lines = [{ variantId: A, qty: 2, status: CartLineStatus.AVAILABLE, productName: "Playera boxy", printName: "Selva", sku: "S-1", unitPriceMxn: 54900 }];

const casa: Wire<SavedAddress> = {
  id: "6ad9245c612875b3a4962c01",
  label: "Casa",
  recipient: "Emilio Díaz",
  line1: "Calle Pino 214",
  line2: null,
  district: "Roma Norte",
  city: "CDMX",
  state: "CMX",
  postalCode: "06700",
  country: "MX",
  phone: "5512345678",
  isDefault: true,
};
const oficina: Wire<SavedAddress> = { ...casa, id: "6ad9245c612875b3a4962c02", label: "Oficina", line1: "Av. Reforma 90", postalCode: "06600", isDefault: false };

const rate = (rateId: string, amount: number, days: number, carrier = "estafeta") => ({ rateId, amount, estimatedDays: days, carrier, carrierName: carrier, service: "t", serviceName: "Terrestre" });
const quote = (rates = [rate("r-dhl", 16400, 1, "dhl"), rate("r-est", 8900, 4)]) => ({
  quoteId: "q1",
  currency: "MXN",
  expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  rates,
});

const summaryFor = (body: { couponCode?: string; shippingQuote?: { rateId: string } }) => {
  const shipping = body.shippingQuote ? (body.shippingQuote.rateId === "r-est" ? 8900 : 16400) : 0;
  const discount = body.couponCode ? 10980 : 0; // 10 % de $1,098.00
  return { currency: "MXN", subtotal: 109800, discount, shippingCost: shipping, tax: 0, taxRateBps: 1600, total: 109800 - discount + shipping, coupon: body.couponCode ? { code: body.couponCode, discountType: "percent", value: 10 } : null };
};

const setup = (addresses = [casa, oficina]) => render(<CheckoutFlow lines={lines} addresses={addresses} />);

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  window.sessionStorage.clear();
  api.previewOrder.mockImplementation((body) => Promise.resolve(summaryFor(body)));
  api.quoteCartShipping.mockResolvedValue(quote());
});

describe("CheckoutFlow: envío", () => {
  it("preselecciona la dirección predeterminada y cotiza para su código postal", async () => {
    setup();
    expect(screen.getByRole("radio", { name: /Casa/ })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Ver opciones de envío" }));
    await waitFor(() => expect(api.quoteCartShipping).toHaveBeenCalledWith({ postalCode: "06700", state: "CMX", city: "CDMX" }));
  });

  it("preselecciona la paquetería más barata y el resumen usa el total del servidor", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Ver opciones de envío" }));
    const cheapest = await screen.findByRole("radio", { name: /Estafeta Terrestre/ });
    expect(cheapest).toBeChecked();
    expect(screen.getByText("Más económico")).toBeInTheDocument();
    await waitFor(() =>
      expect(api.previewOrder).toHaveBeenLastCalledWith({ shippingQuote: { quoteId: "q1", rateId: "r-est" }, postalCode: "06700" }),
    );
    // 1,098.00 + 89.00 de envío = 1,187.00
    expect(await screen.findByRole("button", { name: "Pagar $1,187.00" })).toBeInTheDocument();
  });

  it("al llegar las opciones, el foco va a la tarifa elegida (el botón que lo tenía ya no existe)", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Ver opciones de envío" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: /Estafeta Terrestre/ })).toHaveFocus());
  });

  it("si la cotización falla, el foco va a «Reintentar»", async () => {
    api.quoteCartShipping.mockRejectedValueOnce(new ApiError("Falló.", "http", 502));
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Ver opciones de envío" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Reintentar" })).toHaveFocus());
  });

  it("cambiar de dirección descarta la cotización y hay que volver a pedirla", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Ver opciones de envío" }));
    await screen.findByRole("radio", { name: /Estafeta Terrestre/ });

    await userEvent.click(screen.getByRole("radio", { name: /Oficina/ }));
    expect(await screen.findByRole("button", { name: "Ver opciones de envío" })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /Estafeta Terrestre/ })).toBeNull();
  });

  it("«Usar otra dirección» valida antes de cotizar y no guarda nada en la cuenta", async () => {
    setup();
    await userEvent.click(screen.getByRole("radio", { name: /Usar otra dirección/ }));
    await userEvent.click(screen.getByRole("button", { name: "Ver opciones de envío" }));
    expect(await screen.findByText("Falta quién recibe.")).toBeInTheDocument();
    expect(api.quoteCartShipping).not.toHaveBeenCalled();
    expect(screen.getByText(/no se guarda en tu cuenta/)).toBeInTheDocument();
  });

  it("sin direcciones guardadas muestra el formulario directo", async () => {
    setup([]);
    expect(screen.getByLabelText("Quién recibe")).toBeInTheDocument();
    await screen.findByText(/totales calculados por Gira/);
    expect(screen.queryByRole("radio", { name: /Usar otra dirección/ })).toBeNull();
  });

  it("sin cobertura (422) lo dice y pide cambiar la dirección", async () => {
    api.quoteCartShipping.mockRejectedValue(new ApiError("No hay paquetería disponible para ese código postal.", "http", 422));
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Ver opciones de envío" }));
    expect(await screen.findByText(/No hay paquetería disponible/)).toBeInTheDocument();
    expect(screen.getByText(/Cambia la dirección/)).toBeInTheDocument();
  });

  it("un error de la cotización permite reintentar", async () => {
    api.quoteCartShipping.mockRejectedValueOnce(new ApiError("Falló.", "http", 502)).mockResolvedValueOnce(quote());
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Ver opciones de envío" }));
    await userEvent.click(await screen.findByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("radio", { name: /Estafeta Terrestre/ })).toBeChecked();
  });

  it("una cotización vencida se marca y se puede volver a pedir", async () => {
    api.quoteCartShipping.mockResolvedValueOnce({ ...quote(), expiresAt: new Date(Date.now() - 1000).toISOString() }).mockResolvedValueOnce(quote());
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Ver opciones de envío" }));
    expect(await screen.findByText("Tu cotización venció")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Volver a cotizar" }));
    expect(await screen.findByRole("radio", { name: /Estafeta Terrestre/ })).toBeChecked();
  });
});

describe("CheckoutFlow: pago", () => {
  const readyToPay = async () => {
    await userEvent.click(screen.getByRole("button", { name: "Ver opciones de envío" }));
    await screen.findByRole("button", { name: "Pagar $1,187.00" });
  };

  it("no se puede pagar sin elegir envío ni aceptar los términos", async () => {
    setup();
    await waitFor(() => expect(paymentProps.last).toBeDefined());
    expect(paymentProps.last?.canPay).toBe(false);
    expect(screen.getByText("Elige tu envío para poder pagar.")).toBeInTheDocument();

    await readyToPay();
    expect(paymentProps.last?.canPay).toBe(false);
    expect(screen.getByText("Acepta los términos para poder pagar.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: /Acepto los/ }));
    await waitFor(() => expect(paymentProps.last?.canPay).toBe(true));
  });

  it("un cupón aceptado se aplica con el servidor y cambia el total", async () => {
    setup();
    await readyToPay();
    await userEvent.type(screen.getByLabelText("Cupón"), "GIRA10");
    await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(await screen.findByText("GIRA10")).toBeInTheDocument();
    await waitFor(() => expect(api.previewOrder).toHaveBeenCalledWith(expect.objectContaining({ couponCode: "GIRA10" })));
    expect(await screen.findByRole("button", { name: "Pagar $1,077.20" })).toBeInTheDocument();
  });

  it("un cupón rechazado muestra el motivo y no se aplica", async () => {
    api.previewOrder.mockImplementation((body: { couponCode?: string }) =>
      body.couponCode ? Promise.reject(new ApiError("El cupón ya venció.", "http", 400)) : Promise.resolve(summaryFor(body)),
    );
    setup();
    await userEvent.type(screen.getByLabelText("Cupón"), "VIEJO");
    await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(await screen.findByText("El cupón ya venció.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quitar cupón" })).toBeNull();
  });

  it("el foco sigue al cupón: a «Quitar cupón» al aplicarlo y de vuelta al campo al quitarlo", async () => {
    setup();
    await readyToPay();
    await userEvent.type(screen.getByRole("textbox", { name: "Cupón" }), "GIRA10");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("button", { name: "Quitar cupón" })).toHaveFocus());
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Cupón" })).toHaveFocus());
  });

  it("si el total no se pudo calcular, el motivo se dice junto al botón (no queda mudo)", async () => {
    api.previewOrder.mockImplementation((body: { shippingQuote?: unknown }) =>
      body.shippingQuote ? Promise.reject(new ApiError("Tu pedido queda en menos de $10 y no se puede pagar con tarjeta.", "http", 409)) : Promise.resolve(summaryFor({})),
    );
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Ver opciones de envío" }));
    await screen.findByRole("radio", { name: /Estafeta Terrestre/ });
    expect((await screen.findAllByText(/menos de \$10/)).length).toBeGreaterThanOrEqual(2);
  });

  it("quitar el cupón vuelve al total sin descuento", async () => {
    setup();
    await readyToPay();
    await userEvent.type(screen.getByLabelText("Cupón"), "GIRA10");
    await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    await userEvent.click(await screen.findByRole("button", { name: "Quitar cupón" }));
    expect(await screen.findByRole("button", { name: "Pagar $1,187.00" })).toBeInTheDocument();
  });

  it("al pagar crea la orden desde el carrito con la dirección, la cotización y el cupón elegidos", async () => {
    api.createOrder.mockResolvedValue({ order: { publicId: "p".repeat(43), total: 118700 }, clientSecret: "s" });
    setup();
    await readyToPay();
    await userEvent.click(screen.getByRole("checkbox", { name: /Acepto los/ }));
    await waitFor(() => expect(paymentProps.last?.canPay).toBe(true));

    await userEvent.click(screen.getByRole("button", { name: "Pagar $1,187.00" }));
    await waitFor(() => expect(api.createOrder).toHaveBeenCalledTimes(1));
    const [body, key] = api.createOrder.mock.calls[0] as [Record<string, unknown>, string];
    expect(body).toEqual({
      useCart: true,
      customer: { phone: "5512345678" },
      shipping: { recipient: "Emilio Díaz", line1: "Calle Pino 214", district: "Roma Norte", city: "CDMX", state: "CMX", postalCode: "06700", country: "MX" },
      shippingQuote: { quoteId: "q1", rateId: "r-est" },
      termsAccepted: true,
    });
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("un reintento con el mismo carrito, dirección, paquetería y cupón reutiliza la clave de idempotencia", async () => {
    api.createOrder.mockResolvedValue({ order: { publicId: "p".repeat(43), total: 118700 }, clientSecret: "s" });
    setup();
    await readyToPay();
    await userEvent.click(screen.getByRole("checkbox", { name: /Acepto los/ }));
    await waitFor(() => expect(paymentProps.last?.canPay).toBe(true));

    await userEvent.click(screen.getByRole("button", { name: "Pagar $1,187.00" }));
    await userEvent.click(screen.getByRole("button", { name: "Pagar $1,187.00" }));
    await waitFor(() => expect(api.createOrder).toHaveBeenCalledTimes(2));
    expect(api.createOrder.mock.calls[0]![1]).toBe(api.createOrder.mock.calls[1]![1]);
  });

  it("si el servidor cobraría otro total que el mostrado, la orden no se confirma", async () => {
    api.createOrder.mockResolvedValue({ order: { publicId: "p".repeat(43), total: 150000 }, clientSecret: "s" });
    setup();
    await readyToPay();
    await userEvent.click(screen.getByRole("checkbox", { name: /Acepto los/ }));
    await waitFor(() => expect(paymentProps.last?.canPay).toBe(true));

    const result = await paymentProps.last!.prepare();
    expect(result).toMatchObject({ ok: false, failure: { action: "resume" } });
  });
});
