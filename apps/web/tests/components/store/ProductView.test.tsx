import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PublicProductDetail, PublicProductVariant } from "@gira/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProductView } from "@/components/store/product/ProductView";
import { GUEST_CART_KEY } from "@/lib/cart/guestCart";

const accountCart = vi.hoisted(() => ({ addToAccountCart: vi.fn() }));
vi.mock("@/lib/api/cart", () => accountCart);

const IMAGE = (name: string) => ({ url: `https://res.cloudinary.com/gira/image/upload/v1/${name}.jpg`, publicId: name, width: 800, height: 600 });

const variant = (id: string, printName: string, overrides: Partial<PublicProductVariant> = {}): PublicProductVariant => ({
  id,
  sku: `SKU-${id}`,
  images: [IMAGE(`${id}-1`), IMAGE(`${id}-2`)],
  price: 49900,
  isAvailable: true,
  print: { id: `pr-${id}`, name: printName, slug: printName.toLowerCase(), sku: `P-${id}`, image: IMAGE(`print-${id}`) },
  ...overrides,
});

const product = (overrides: Partial<PublicProductDetail> = {}): PublicProductDetail => ({
  id: "p1",
  name: "Playera boxy",
  slug: "playera-boxy",
  category: { id: "c1", name: "Playeras", slug: "playeras", color: "lilac" },
  measurements: {},
  materials: [],
  bestSeller: false,
  newArrival: false,
  cardTags: [],
  description: "Corte amplio.",
  variants: [
    variant("a1", "Sol"),
    variant("b2", "Luna", { price: 54900 }),
    variant("c3", "Cereza", { isAvailable: false }),
  ],
  ...overrides,
});

beforeEach(() => accountCart.addToAccountCart.mockReset());
afterEach(() => window.localStorage.clear());

describe("ProductView", () => {
  it("abre en la primera estampa con su precio y el nombre como único h1", () => {
    render(<ProductView product={product()} authenticated={false} />);
    expect(screen.getByRole("heading", { level: 1, name: "Playera boxy" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Sol" })).toBeChecked();
    expect(screen.getAllByText("$499.00").length).toBeGreaterThan(0);
  });

  it("abre en la variante que mostraba la tarjeta del catálogo", () => {
    render(<ProductView product={product({ card: { variantId: "b2", images: [], price: 54900, isAvailable: true } })} authenticated={false} />);
    expect(screen.getByRole("radio", { name: "Luna" })).toBeChecked();
  });

  it("al elegir otra estampa cambia el precio y la cantidad vuelve a 1", async () => {
    render(<ProductView product={product()} authenticated={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Agregar una" }));
    expect(screen.getByText("2 piezas")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Luna" }));
    expect(screen.getByRole("radio", { name: "Luna" })).toBeChecked();
    expect(screen.getByText("1 pieza")).toBeInTheDocument();
    expect(screen.getAllByText("$549.00").length).toBeGreaterThan(0);
  });

  it("estampa en rebaja: muestra el precio rebajado, el anterior tachado y el total de la cantidad", async () => {
    const onSale = product({ variants: [variant("a1", "Sol", { price: 39900, compareAtPrice: 49900 })] });
    const { container } = render(<ProductView product={onSale} authenticated={false} />);
    expect(container.querySelector("s")).toHaveTextContent("Antes $499.00");
    expect(screen.getAllByText("$399.00").length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: "Agregar una" }));
    expect(screen.getByText("$798.00")).toBeInTheDocument();
  });

  it("una estampa sin rebaja no tacha nada aunque otra sí esté rebajada", async () => {
    const mixed = product({ variants: [variant("a1", "Sol", { price: 39900, compareAtPrice: 49900 }), variant("b2", "Luna", { price: 54900 })] });
    const { container } = render(<ProductView product={mixed} authenticated={false} />);
    expect(container.querySelector("s")).not.toBeNull();
    await userEvent.click(screen.getByRole("radio", { name: "Luna" }));
    expect(container.querySelector("s")).toBeNull();
  });

  it("las flechas mueven la selección entre estampas y dan la vuelta", async () => {
    render(<ProductView product={product()} authenticated={false} />);
    screen.getByRole("radio", { name: "Sol" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Luna" })).toBeChecked();
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("radio", { name: "Cereza, agotada" })).toBeChecked();
  });

  it("estampa agotada: el botón dice «Agotada» y no se puede pulsar", async () => {
    render(<ProductView product={product()} authenticated={false} />);
    await userEvent.click(screen.getByRole("radio", { name: "Cereza, agotada" }));
    expect(screen.getByRole("button", { name: /Agotada/ })).toBeDisabled();
  });

  it("visitante: agrega la cantidad elegida al carrito del navegador", async () => {
    render(<ProductView product={product()} authenticated={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Agregar una" }));
    await userEvent.click(screen.getByRole("button", { name: "Agregar una" }));
    await userEvent.click(screen.getByRole("button", { name: /Agregar al carrito/ }));
    expect(JSON.parse(window.localStorage.getItem(GUEST_CART_KEY) ?? "[]")).toEqual([{ variantId: "a1", qty: 3 }]);
    expect(accountCart.addToAccountCart).not.toHaveBeenCalled();
  });

  it("con sesión: usa el carrito de la cuenta con la cantidad", async () => {
    accountCart.addToAccountCart.mockResolvedValue(true);
    render(<ProductView product={product()} authenticated />);
    await userEvent.click(screen.getByRole("button", { name: "Agregar una" }));
    await userEvent.click(screen.getByRole("button", { name: /Agregar al carrito/ }));
    expect(accountCart.addToAccountCart).toHaveBeenCalledWith("a1", 2);
  });

  it("sin descripción no pinta el párrafo y sin variantes avisa en vez de mostrar el botón", () => {
    const bare = product({ variants: [] });
    delete bare.description;
    render(<ProductView product={bare} authenticated={false} />);
    expect(screen.queryByText("Corte amplio.")).not.toBeInTheDocument();
    expect(screen.getByText(/no hay estampas disponibles/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Agregar al carrito/ })).not.toBeInTheDocument();
  });

  it("el acordeón de garantías arranca cerrado y abre un renglón al pulsarlo", async () => {
    render(<ProductView product={product()} authenticated={false} />);
    expect(screen.getByRole("button", { name: "Pagos 100% seguros" })).toHaveAttribute("aria-expanded", "false");
    const shipping = screen.getByRole("button", { name: "Envíos a todo México" });
    expect(shipping).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(shipping);
    expect(shipping).toHaveAttribute("aria-expanded", "true");
  });
});
