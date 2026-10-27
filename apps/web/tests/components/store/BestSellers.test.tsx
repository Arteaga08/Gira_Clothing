import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PublicProductSummary } from "@gira/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BestSellerCard } from "@/components/store/best-sellers/BestSellerCard";
import { AddToCartButton } from "@/components/store/best-sellers/AddToCartButton";
import { ApiError } from "@/lib/api/ApiError";
import { GUEST_CART_KEY } from "@/lib/cart/guestCart";

const accountCart = vi.hoisted(() => ({ addToAccountCart: vi.fn() }));
vi.mock("@/lib/api/cart", () => accountCart);

const IMAGE = (name: string) => ({ url: `https://res.cloudinary.com/gira/image/upload/v1/${name}.jpg`, publicId: name, width: 800, height: 600 });

const product = (overrides: Partial<PublicProductSummary> = {}): PublicProductSummary => ({
  id: "p1",
  name: "Playera oversize",
  slug: "playera-oversize",
  category: { id: "c1", name: "Playeras", slug: "playeras", color: "lilac" },
  basePrice: 42900,
  measurements: {},
  materials: [],
  bestSeller: true,
  newArrival: false,
  cardTags: ["Fresca", "Suave"],
  card: { variantId: "6ad9245c612875b3a4962bb5", images: [IMAGE("uno"), IMAGE("dos")], price: 47900, isAvailable: true },
  ...overrides,
});

beforeEach(() => {
  accountCart.addToAccountCart.mockReset();
});
afterEach(() => {
  window.localStorage.clear();
});

describe("BestSellerCard", () => {
  it("lleva al producto desde la foto, muestra nombre, palabras y precio de la variante", () => {
    render(<BestSellerCard product={product()} authenticated={false} index={0} />);
    expect(screen.getByRole("heading", { name: "Playera oversize" })).toBeInTheDocument();
    expect(screen.getByText("Fresca, Suave")).toBeInTheDocument();
    expect(screen.getByText("$479.00")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver Playera oversize" })).toHaveAttribute("href", "/tienda/playera-oversize");
  });

  it("pinta la segunda foto (la del hover) solo cuando existe", () => {
    const { container, rerender } = render(<BestSellerCard product={product()} authenticated={false} index={0} />);
    expect(container.querySelectorAll("img")).toHaveLength(2);
    rerender(<BestSellerCard product={product({ card: { variantId: "v", images: [IMAGE("uno")], price: 1, isAvailable: true } })} authenticated={false} index={0} />);
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });

  it("sin palabras no deja una banda vacía", () => {
    render(<BestSellerCard product={product({ cardTags: [] })} authenticated={false} index={0} />);
    expect(screen.queryByText("Fresca, Suave")).not.toBeInTheDocument();
  });

  it("agotado: el botón dice «Agotado ):» y no se puede pulsar", () => {
    render(<BestSellerCard product={product({ card: { variantId: "v", images: [], price: 1, isAvailable: false } })} authenticated={false} index={0} />);
    expect(screen.getByRole("button", { name: "Playera oversize, agotado" })).toBeDisabled();
    expect(screen.getByText("Agotado ):")).toBeInTheDocument();
  });
});

describe("AddToCartButton", () => {
  const VARIANT = "6ad9245c612875b3a4962bb5";

  it("visitante: escribe el carrito del navegador y confirma", async () => {
    render(<AddToCartButton variantId={VARIANT} productName="Gorra" isAvailable authenticated={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Agregar Gorra al carrito" }));
    expect(JSON.parse(window.localStorage.getItem(GUEST_CART_KEY) ?? "[]")).toEqual([{ variantId: VARIANT, qty: 1 }]);
    expect(await screen.findByText("Agregado")).toBeInTheDocument();
    expect(accountCart.addToAccountCart).not.toHaveBeenCalled();
  });

  it("con sesión: usa el carrito de la cuenta", async () => {
    accountCart.addToAccountCart.mockResolvedValue(true);
    render(<AddToCartButton variantId={VARIANT} productName="Gorra" isAvailable authenticated />);
    await userEvent.click(screen.getByRole("button", { name: "Agregar Gorra al carrito" }));
    expect(accountCart.addToAccountCart).toHaveBeenCalledWith(VARIANT, 1);
    expect(await screen.findByText("Agregado")).toBeInTheDocument();
    expect(window.localStorage.getItem(GUEST_CART_KEY)).toBeNull();
  });

  it("en el máximo por línea lo dice", async () => {
    accountCart.addToAccountCart.mockResolvedValue(false);
    render(<AddToCartButton variantId={VARIANT} productName="Gorra" isAvailable authenticated />);
    await userEvent.click(screen.getByRole("button", { name: "Agregar Gorra al carrito" }));
    expect(await screen.findByText("Ya tienes el máximo")).toBeInTheDocument();
  });

  it("si el API rechaza, avisa con su mensaje y deja volver a intentar", async () => {
    accountCart.addToAccountCart.mockRejectedValue(new ApiError("Sin existencias.", "http", 409));
    render(<AddToCartButton variantId={VARIANT} productName="Gorra" isAvailable authenticated />);
    await userEvent.click(screen.getByRole("button", { name: "Agregar Gorra al carrito" }));
    expect(await screen.findByText("No se pudo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agregar Gorra al carrito" })).toBeEnabled();
  });
});
