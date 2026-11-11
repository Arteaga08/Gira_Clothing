import { useEffect } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicOrder } from "@gira/shared";
import { PaymentFields } from "@/components/store/checkout/PaymentFields";
import { CART_CHANGED_EVENT } from "@/lib/cart/guestCart";

const stripe = vi.hoisted(() => ({ confirmPayment: vi.fn() }));
const elements = vi.hoisted(() => ({ submit: vi.fn() }));
const elementsOptions = vi.hoisted(() => ({ last: undefined as unknown }));

vi.mock("@stripe/stripe-js", () => ({ loadStripe: vi.fn(() => Promise.resolve({})) }));
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ options, children }: { options: unknown; children: React.ReactNode }) => {
    elementsOptions.last = options;
    return <>{children}</>;
  },
  PaymentElement: ({ onReady }: { onReady: () => void }) => {
    useEffect(() => onReady(), [onReady]);
    return <div data-testid="payment-element" />;
  },
  useStripe: () => stripe,
  useElements: () => elements,
}));
vi.mock("@/lib/checkout/stripeConfig", () => ({ stripePublishableKey: "pk_test_123" }));
vi.mock("@/lib/checkout/stripeAppearance", () => ({ buildStripeAppearance: () => ({ theme: "flat" }), readTokenColor: () => "rgb(0, 0, 0)", readToken: () => "system-ui" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const PUBLIC_ID = "p".repeat(43);
const order = { publicId: PUBLIC_ID, total: 130130 } as unknown as PublicOrder;
const prepared = { ok: true as const, order, clientSecret: "pi_1_secret_x" };

const setup = (overrides: Partial<React.ComponentProps<typeof PaymentFields>> = {}) => {
  const props = {
    amount: 130130,
    payLabel: "Pagar $1,301.30",
    canPay: true,
    prepare: vi.fn().mockResolvedValue(prepared),
    returnUrl: (id: string) => `http://localhost/orden/${id}`,
    onPaid: vi.fn(),
    handlers: { onRequote: vi.fn(), onRemoveCoupon: vi.fn() },
    ...overrides,
  };
  render(<PaymentFields {...props} />);
  return props;
};
const payButton = () => screen.findByRole("button", { name: "Pagar $1,301.30" });

beforeEach(() => {
  stripe.confirmPayment.mockReset();
  elements.submit.mockReset().mockResolvedValue({});
});

describe("PaymentFields", () => {
  it("monta el Element diferido: monto del servidor, solo tarjeta, en español", async () => {
    setup();
    await payButton();
    expect(elementsOptions.last).toMatchObject({ mode: "payment", amount: 130130, currency: "mxn", paymentMethodTypes: ["card"], locale: "es" });
  });

  it("paga en orden: valida el formulario, crea la orden y confirma con su secreto; avisa al carrito", async () => {
    const calls: string[] = [];
    elements.submit.mockImplementation(() => (calls.push("submit"), Promise.resolve({})));
    const prepare = vi.fn().mockImplementation(() => (calls.push("prepare"), Promise.resolve(prepared)));
    stripe.confirmPayment.mockImplementation(() => (calls.push("confirm"), Promise.resolve({ paymentIntent: { status: "succeeded" } })));
    const changed = vi.fn();
    window.addEventListener(CART_CHANGED_EVENT, changed);

    const props = setup({ prepare });
    await userEvent.click(await payButton());

    await waitFor(() => expect(props.onPaid).toHaveBeenCalledWith(PUBLIC_ID));
    expect(calls).toEqual(["submit", "prepare", "confirm"]);
    expect(stripe.confirmPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        clientSecret: "pi_1_secret_x",
        redirect: "if_required",
        confirmParams: { return_url: `http://localhost/orden/${PUBLIC_ID}` },
      }),
    );
    expect(changed).toHaveBeenCalled();
    window.removeEventListener(CART_CHANGED_EVENT, changed);
  });

  it("sin los requisitos de afuera (envío, términos) no crea ninguna orden", async () => {
    const props = setup({ canPay: false });
    await userEvent.click(await payButton());
    expect(elements.submit).not.toHaveBeenCalled();
    expect(props.prepare).not.toHaveBeenCalled();
  });

  it("si el formulario de tarjeta no valida, lo dice y no crea la orden", async () => {
    elements.submit.mockResolvedValue({ error: { type: "validation_error", message: "Falta el CVC." } });
    const props = setup();
    await userEvent.click(await payButton());
    expect(await screen.findByText("Falta el CVC.")).toBeInTheDocument();
    expect(props.prepare).not.toHaveBeenCalled();
    expect(stripe.confirmPayment).not.toHaveBeenCalled();
  });

  it("si la orden no se pudo preparar, no cobra y ofrece la salida (cotización vencida → volver a cotizar)", async () => {
    const prepare = vi.fn().mockResolvedValue({
      ok: false,
      failure: { action: "requote", message: "La cotización de envío venció. Vuelve a elegir tu envío.", definitive: true },
    });
    const props = setup({ prepare });
    await userEvent.click(await payButton());
    await userEvent.click(await screen.findByRole("button", { name: "Volver a cotizar" }));
    expect(props.handlers?.onRequote).toHaveBeenCalled();
    expect(stripe.confirmPayment).not.toHaveBeenCalled();
  });

  it("una tarjeta rechazada deja reintentar con el mismo pedido", async () => {
    stripe.confirmPayment
      .mockResolvedValueOnce({ error: { type: "card_error", message: "Tu tarjeta fue rechazada." } })
      .mockResolvedValueOnce({ paymentIntent: { status: "succeeded" } });
    const props = setup();

    await userEvent.click(await payButton());
    expect(await screen.findByText(/Tu tarjeta fue rechazada\. Tu pedido sigue reservado por unos minutos\./)).toBeInTheDocument();
    expect(props.onPaid).not.toHaveBeenCalled();

    await userEvent.click(await payButton());
    await waitFor(() => expect(props.onPaid).toHaveBeenCalledWith(PUBLIC_ID));
    expect(props.prepare).toHaveBeenCalledTimes(2);
  });

  it("mientras procesa, «Pagar» sigue enfocable (aria-disabled, no disabled) y dice que procesa", async () => {
    let release: (v: unknown) => void = () => undefined;
    stripe.confirmPayment.mockReturnValue(new Promise((resolve) => (release = resolve)));
    setup();
    const button = await payButton();
    button.focus();
    await userEvent.click(button);
    const busy = await screen.findByRole("button", { name: "Procesando tu pago…" });
    expect(busy).toHaveAttribute("aria-disabled", "true");
    expect(busy).not.toBeDisabled();
    expect(busy).toHaveFocus();
    release({ paymentIntent: { status: "succeeded" } });
  });

  it("si la confirmación se cae (red, error inesperado) lo dice y no deja el botón mudo", async () => {
    stripe.confirmPayment.mockRejectedValue(new Error("network down"));
    const props = setup();
    await userEvent.click(await payButton());
    expect(await screen.findByText("No pudimos completar el pago")).toBeInTheDocument();
    expect(screen.getByText(/lo verás en «Mis pedidos»/)).toBeInTheDocument();
    expect(props.onPaid).not.toHaveBeenCalled();
    expect(await payButton()).not.toHaveAttribute("aria-busy");
  });

  it("un pago ya confirmado (doble clic, otra pestaña) se trata como pagado", async () => {
    stripe.confirmPayment.mockResolvedValue({ error: { type: "invalid_request_error", code: "payment_intent_unexpected_state" } });
    const props = setup();
    await userEvent.click(await payButton());
    await waitFor(() => expect(props.onPaid).toHaveBeenCalledWith(PUBLIC_ID));
  });

  it("un doble clic mientras procesa confirma el pago una sola vez", async () => {
    let release: (v: unknown) => void = () => undefined;
    stripe.confirmPayment.mockReturnValue(new Promise((resolve) => (release = resolve)));
    setup();
    const button = await payButton();
    await userEvent.dblClick(button);
    release({ paymentIntent: { status: "succeeded" } });
    await waitFor(() => expect(stripe.confirmPayment).toHaveBeenCalledTimes(1));
  });
});
