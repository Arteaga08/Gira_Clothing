import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CartLineStatus } from "@gira/shared";
import { CartFlow } from "@/components/store/cart/CartFlow";
import { CART_CHANGED_EVENT, GUEST_CART_KEY } from "@/lib/cart/guestCart";

const api = vi.hoisted(() => ({
  fetchAccountCart: vi.fn(),
  previewGuestCart: vi.fn(),
  removeAccountCartLine: vi.fn(),
  setAccountCartQty: vi.fn(),
}));
vi.mock("@/lib/api/cart", () => api);

const A = "6ad9245c612875b3a4962bb1";
const B = "6ad9245c612875b3a4962bb2";
const C = "6ad9245c612875b3a4962bb3";

const available = (variantId: string, qty: number, unitPriceMxn: number) => ({
  variantId,
  qty,
  status: CartLineStatus.AVAILABLE,
  productName: "Playera boxy",
  printName: "Selva",
  sku: `SKU-${variantId.slice(-1)}`,
  unitPriceMxn,
});
const soldOut = { variantId: B, qty: 1, status: CartLineStatus.OUT_OF_STOCK, productName: "Hoodie pesado", printName: "Sol", sku: "SKU-B", unitPriceMxn: 89900 };
const retired = { variantId: C, qty: 1, status: CartLineStatus.RETIRED };

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  window.localStorage.clear();
});

describe("CartFlow (visitante)", () => {
  it("lee el carrito del navegador, lo prepara con el API y suma solo lo disponible", async () => {
    window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify([{ variantId: A, qty: 2 }]));
    api.previewGuestCart.mockResolvedValue({ lines: [available(A, 2, 54900), soldOut, retired] });
    render(<CartFlow authenticated={false} />);

    expect(await screen.findByRole("list", { name: "Artículos de tu carrito" })).toBeInTheDocument();
    expect(api.previewGuestCart).toHaveBeenCalledWith([{ variantId: A, qty: 2 }]);
    expect(screen.getByText("Subtotal (2 artículos)")).toBeInTheDocument();
    // $549.00 x 2, las otras dos líneas fuera del total (el total aparece en la línea y en el resumen)
    expect(screen.getAllByText("$1,098.00").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Agotado por ahora")).toBeInTheDocument();
    expect(screen.getAllByText("Ya no está disponible").length).toBeGreaterThan(0);
  });

  it("con líneas agotadas o retiradas bloquea «Continuar al pago» y dice cuántas quitar", async () => {
    api.previewGuestCart.mockResolvedValue({ lines: [available(A, 1, 10000), soldOut, retired] });
    window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify([{ variantId: A, qty: 1 }]));
    render(<CartFlow authenticated={false} />);

    expect(await screen.findByText("Quita 2 artículos para continuar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar al pago" })).toBeDisabled();
  });

  it("quitar la línea retirada la saca del carrito del navegador y avisa al contador", async () => {
    window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify([{ variantId: A, qty: 1 }, { variantId: C, qty: 1 }]));
    api.previewGuestCart
      .mockResolvedValueOnce({ lines: [available(A, 1, 10000), retired] })
      .mockResolvedValueOnce({ lines: [available(A, 1, 10000)] });
    const changed = vi.fn();
    window.addEventListener(CART_CHANGED_EVENT, changed);
    render(<CartFlow authenticated={false} />);

    const row = (await screen.findByText("Este producto ya no está disponible")).closest("li")!;
    await userEvent.click(within(row).getByRole("button", { name: /Quitar/ }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Continuar al pago" })).toBeEnabled());
    expect(JSON.parse(window.localStorage.getItem(GUEST_CART_KEY) ?? "[]")).toEqual([{ variantId: A, qty: 1 }]);
    expect(changed).toHaveBeenCalled();
    window.removeEventListener(CART_CHANGED_EVENT, changed);
  });

  it("«Continuar al pago» abre la puerta: iniciar sesión y crear cuenta, ambos con ?redirect=/checkout", async () => {
    window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify([{ variantId: A, qty: 1 }]));
    api.previewGuestCart.mockResolvedValue({ lines: [available(A, 1, 10000)] });
    render(<CartFlow authenticated={false} />);

    await userEvent.click(await screen.findByRole("button", { name: "Continuar al pago" }));
    expect(screen.getByRole("heading", { name: "Entra para pagar" })).toHaveFocus();
    expect(screen.getByRole("link", { name: "Iniciar sesión" })).toHaveAttribute("href", "/ingresar?redirect=%2Fcheckout");
    expect(screen.getByRole("link", { name: "Crear cuenta" })).toHaveAttribute("href", "/crear-cuenta?redirect=%2Fcheckout");
    expect(screen.queryByRole("button", { name: "Continuar al pago" })).toBeNull();
  });

  it("el stepper sube la cantidad y no pasa de 20 ni baja de 1", async () => {
    window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify([{ variantId: A, qty: 20 }]));
    api.previewGuestCart.mockResolvedValue({ lines: [available(A, 20, 10000)] });
    render(<CartFlow authenticated={false} />);
    await screen.findByRole("list");
    expect(screen.getByRole("button", { name: "Una unidad más" })).toHaveAttribute("aria-disabled", "true");

    api.previewGuestCart.mockResolvedValue({ lines: [available(A, 19, 10000)] });
    await userEvent.click(screen.getByRole("button", { name: "Una unidad menos" }));
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(GUEST_CART_KEY) ?? "[]")).toEqual([{ variantId: A, qty: 19 }]));
  });

  it("el stepper no pierde el foco al guardar: sigue en el botón que se presionó", async () => {
    window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify([{ variantId: A, qty: 2 }]));
    api.previewGuestCart.mockResolvedValue({ lines: [available(A, 2, 10000)] });
    render(<CartFlow authenticated={false} />);
    const plus = await screen.findByRole("button", { name: "Una unidad más" });
    plus.focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(GUEST_CART_KEY) ?? "[]")).toEqual([{ variantId: A, qty: 3 }]));
    expect(screen.getByRole("button", { name: "Una unidad más" })).toHaveFocus();
  });

  it("un botón del stepper sin acción (en el límite) no hace nada al presionarlo", async () => {
    window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify([{ variantId: A, qty: 1 }]));
    api.previewGuestCart.mockResolvedValue({ lines: [available(A, 1, 10000)] });
    render(<CartFlow authenticated={false} />);
    await userEvent.click(await screen.findByRole("button", { name: "Una unidad menos" }));
    expect(JSON.parse(window.localStorage.getItem(GUEST_CART_KEY) ?? "[]")).toEqual([{ variantId: A, qty: 1 }]);
  });

  it("al quitar una línea, el foco pasa a la lista (no se pierde en la página)", async () => {
    window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify([{ variantId: A, qty: 1 }, { variantId: B, qty: 1 }]));
    api.previewGuestCart
      .mockResolvedValueOnce({ lines: [available(A, 1, 10000), { ...available(B, 1, 20000), productName: "Gorra" }] })
      .mockResolvedValueOnce({ lines: [available(A, 1, 10000)] });
    render(<CartFlow authenticated={false} />);
    await userEvent.click(await screen.findByRole("button", { name: /Quitar Gorra/ }));
    await waitFor(() => expect(screen.getByRole("list", { name: "Artículos de tu carrito" })).toHaveFocus());
  });

  it("un carrito vacío muestra el estado vacío con el camino a la tienda", async () => {
    api.previewGuestCart.mockResolvedValue({ lines: [] });
    render(<CartFlow authenticated={false} />);
    expect(await screen.findByText("Tu carrito está vacío")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir a la tienda" })).toHaveAttribute("href", "/tienda");
  });

  it("mientras carga, el esqueleto se anuncia una sola vez", async () => {
    api.previewGuestCart.mockReturnValue(new Promise(() => undefined));
    render(<CartFlow authenticated={false} />);
    expect(screen.getAllByRole("status", { name: "Cargando tu carrito" })).toHaveLength(1);
  });

  it("si el API falla ofrece reintentar y lo logra", async () => {
    api.previewGuestCart.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce({ lines: [] });
    render(<CartFlow authenticated={false} />);
    expect(await screen.findByText("No pudimos cargar tu carrito")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Tu carrito está vacío")).toBeInTheDocument();
  });
});

describe("CartFlow (con sesión)", () => {
  it("lee el carrito de la cuenta y «Continuar al pago» es un enlace a /checkout", async () => {
    api.fetchAccountCart.mockResolvedValue({ lines: [available(A, 1, 10000)] });
    render(<CartFlow authenticated />);
    const cta = await screen.findByRole("link", { name: "Continuar al pago" });
    expect(cta).toHaveAttribute("href", "/checkout");
    expect(api.previewGuestCart).not.toHaveBeenCalled();
  });

  it("cambiar la cantidad la fija en la cuenta (el API fija, no suma)", async () => {
    api.fetchAccountCart.mockResolvedValue({ lines: [available(A, 2, 10000)] });
    api.setAccountCartQty.mockResolvedValue(undefined);
    render(<CartFlow authenticated />);
    await userEvent.click(await screen.findByRole("button", { name: "Una unidad más" }));
    expect(api.setAccountCartQty).toHaveBeenCalledWith(A, 3);
  });

  it("quitar una línea llama a DELETE de la cuenta", async () => {
    api.fetchAccountCart.mockResolvedValue({ lines: [available(A, 1, 10000)] });
    api.removeAccountCartLine.mockResolvedValue(undefined);
    render(<CartFlow authenticated />);
    await userEvent.click(await screen.findByRole("button", { name: /Quitar Playera boxy/ }));
    expect(api.removeAccountCartLine).toHaveBeenCalledWith(A);
  });
});
