import { act, render, screen } from "@testing-library/react";
import type { PublicStorefrontHero } from "@gira/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeroCarousel } from "@/components/store/hero/HeroCarousel";
import { HeroFallback } from "@/components/store/hero/HeroFallback";

const image = (n: number) => ({ url: `https://res.cloudinary.com/gira/image/upload/${n}.jpg`, width: 1600, height: 1000 });

const hero: PublicStorefrontHero = {
  headline: "Estampa que gira",
  slides: [
    {
      image: image(1),
      product: { slug: "playera-flor", name: "Playera Flor" },
      titleColor: "pink",
      buttonColor: "mint",
      cards: [{ text: "Estampas únicas", color: "lilac" }],
    },
    { image: image(2), product: null, titleColor: "lilac", buttonColor: "yellow", cards: [] },
  ],
};

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const titleWord = () => screen.getByText("Estampa");
const button = () => screen.getAllByRole("link")[0] as HTMLAnchorElement;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("HeroCarousel", () => {
  it("muestra el titular en una etiqueta por palabra, con el color de la primera foto", () => {
    render(<HeroCarousel hero={hero} fallbackHeadline="Gira Clothing" />);
    expect(screen.getAllByText(/^(Estampa|que|gira)$/)).toHaveLength(3);
    expect(titleWord()).toHaveClass("bg-accent");
  });

  it("el botón lleva al producto de la foto visible y toma su color", () => {
    render(<HeroCarousel hero={hero} fallbackHeadline="Gira Clothing" />);
    expect(button()).toHaveAttribute("href", "/tienda/playera-flor");
    expect(button()).toHaveClass("bg-brand-subtle");
    expect(button()).toHaveTextContent("Ver producto");
    expect(screen.getByText("Estampas únicas")).toBeInTheDocument();
  });

  it("a los 3 segundos pasa a la siguiente foto: cambian colores, enlace y cards", () => {
    render(<HeroCarousel hero={hero} fallbackHeadline="Gira Clothing" />);
    advance(2999);
    expect(titleWord()).toHaveClass("bg-accent");
    advance(1);
    expect(titleWord()).toHaveClass("bg-tile-alt");
    expect(button()).toHaveAttribute("href", "/tienda");
    expect(button()).toHaveClass("bg-cta");
    expect(button()).toHaveTextContent("Ver tienda");
    expect(screen.queryByText("Estampas únicas")).not.toBeInTheDocument();
  });

  it("después de la última foto vuelve a la primera (sube, nunca regresa)", () => {
    render(<HeroCarousel hero={hero} fallbackHeadline="Gira Clothing" />);
    advance(3000);
    advance(3000);
    expect(titleWord()).toHaveClass("bg-accent");
    advance(900);
    expect(titleWord()).toHaveClass("bg-accent");
    expect(button()).toHaveAttribute("href", "/tienda/playera-flor");
  });

  it("se detiene mientras el foco del teclado está dentro y sigue al salir", () => {
    render(<HeroCarousel hero={hero} fallbackHeadline="Gira Clothing" />);
    act(() => button().focus());
    advance(9000);
    expect(titleWord()).toHaveClass("bg-accent");
    act(() => button().blur());
    advance(3000);
    expect(titleWord()).toHaveClass("bg-tile-alt");
  });

  it("con el titular vacío usa el nombre de la marca", () => {
    render(<HeroCarousel hero={{ ...hero, headline: "  " }} fallbackHeadline="Gira Clothing" />);
    expect(screen.getByText("Gira")).toBeInTheDocument();
    expect(screen.getByText("Clothing")).toBeInTheDocument();
  });
});

describe("HeroFallback", () => {
  it("muestra el titular y un botón a la tienda cuando no hay fotos", () => {
    render(<HeroFallback headline="Gira Clothing" />);
    expect(screen.getByRole("link", { name: /Ver tienda/ })).toHaveAttribute("href", "/tienda");
  });
});
