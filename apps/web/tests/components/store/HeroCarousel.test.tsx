import { act, fireEvent, render, screen } from "@testing-library/react";
import type { PublicStorefrontHero } from "@gira/shared";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { HeroCarousel } from "@/components/store/hero/HeroCarousel";
import { HeroFallback } from "@/components/store/hero/HeroFallback";

const image = (n: number) => ({ url: `https://res.cloudinary.com/gira/image/upload/${n}.jpg`, width: 1600, height: 1000 });

const hero: PublicStorefrontHero = {
  slides: [
    {
      headline: "Estampa que gira",
      image: image(1),
      product: { slug: "playera-flor", name: "Playera Flor" },
      titleColor: "pink",
      buttonColor: "mint",
      cards: [{ text: "Estampas únicas", color: "lilac" }],
    },
    { headline: "Segunda foto", image: image(2), product: null, titleColor: "lilac", buttonColor: "yellow", cards: [] },
  ],
};

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
/** Every photo's title and cards stay mounted; only the visible photo's are exposed. */
const isShown = (element: HTMLElement) => element.closest('[aria-hidden="true"]') === null;
const firstWord = () => screen.getByText("Estampa");
const secondWord = () => screen.getByText("Segunda");
const button = () => screen.getAllByRole("link")[0] as HTMLAnchorElement;

// jsdom has no PointerEvent: without it `pointerType` and the coordinates never reach the handlers.
beforeAll(() => {
  if (typeof window.PointerEvent !== "undefined") return;
  class TestPointerEvent extends MouseEvent {
    readonly pointerType: string;
    constructor(type: string, init: MouseEventInit & { pointerType?: string } = {}) {
      super(type, init);
      this.pointerType = init.pointerType ?? "mouse";
    }
  }
  Object.defineProperty(window, "PointerEvent", { value: TestPointerEvent, configurable: true });
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("HeroCarousel", () => {
  it("muestra el titular de la primera foto, una etiqueta por palabra y con su color", () => {
    render(<HeroCarousel hero={hero} fallbackHeadline="Gira Clothing" />);
    expect(isShown(firstWord())).toBe(true);
    expect(firstWord()).toHaveClass("bg-accent");
    expect(screen.getByText("que")).toBeInTheDocument();
    expect(isShown(secondWord())).toBe(false);
  });

  it("el botón lleva al producto de la foto visible y toma su color", () => {
    render(<HeroCarousel hero={hero} fallbackHeadline="Gira Clothing" />);
    expect(button()).toHaveAttribute("href", "/tienda/playera-flor");
    expect(button()).toHaveClass("bg-brand-subtle");
    expect(button()).toHaveTextContent("Ver producto");
    expect(isShown(screen.getByText("Estampas únicas"))).toBe(true);
  });

  it("a los 3 segundos cambia de foto: titular, color, enlace y cards", () => {
    render(<HeroCarousel hero={hero} fallbackHeadline="Gira Clothing" />);
    advance(2999);
    expect(isShown(firstWord())).toBe(true);
    advance(1);
    expect(isShown(secondWord())).toBe(true);
    expect(secondWord()).toHaveClass("bg-tile-alt");
    expect(isShown(firstWord())).toBe(false);
    expect(button()).toHaveAttribute("href", "/tienda");
    expect(button()).toHaveClass("bg-cta");
    expect(button()).toHaveTextContent("Ver tienda");
    expect(isShown(screen.getByText("Estampas únicas"))).toBe(false);
  });

  it("nada se desmonta al cambiar de foto (un remontaje es lo que parpadea)", () => {
    render(<HeroCarousel hero={hero} fallbackHeadline="Gira Clothing" />);
    const card = screen.getByText("Estampas únicas");
    const word = firstWord();
    advance(3000);
    advance(3000);
    expect(screen.getByText("Estampas únicas")).toBe(card);
    expect(firstWord()).toBe(word);
  });

  it("después de la última foto vuelve a la primera", () => {
    render(<HeroCarousel hero={hero} fallbackHeadline="Gira Clothing" />);
    advance(3000);
    advance(3000);
    expect(isShown(firstWord())).toBe(true);
    expect(button()).toHaveAttribute("href", "/tienda/playera-flor");
  });

  it("solo la foto visible está expuesta y solo la primera es prioritaria", () => {
    const { container } = render(<HeroCarousel hero={hero} fallbackHeadline="Gira Clothing" />);
    const photos = Array.from(container.querySelectorAll("img"));
    expect(photos).toHaveLength(2);
    expect(photos[0]).toHaveAttribute("loading", "eager");
    expect(photos[1]).toHaveAttribute("loading", "lazy");
    expect(isShown(photos[0] as HTMLElement)).toBe(true);
    expect(isShown(photos[1] as HTMLElement)).toBe(false);
  });

  it("se detiene mientras el foco del teclado está dentro y sigue al salir", () => {
    render(<HeroCarousel hero={hero} fallbackHeadline="Gira Clothing" />);
    act(() => button().focus());
    advance(9000);
    expect(isShown(firstWord())).toBe(true);
    act(() => button().blur());
    advance(3000);
    expect(isShown(secondWord())).toBe(true);
  });

  describe("a mano", () => {
    const pressKey = (key: string, init: KeyboardEventInit = {}, target: Element = document.body) =>
      act(() => {
        fireEvent.keyDown(target, { key, ...init });
      });

    it("la flecha derecha avanza y la izquierda retrocede (y da la vuelta)", () => {
      render(<HeroCarousel hero={hero} fallbackHeadline="Gira Clothing" />);
      pressKey("ArrowRight");
      expect(isShown(secondWord())).toBe(true);
      pressKey("ArrowLeft");
      expect(isShown(firstWord())).toBe(true);
      pressKey("ArrowLeft");
      expect(isShown(secondWord())).toBe(true);
    });

    it("mover a mano reinicia la cuenta de 3 segundos", () => {
      render(<HeroCarousel hero={hero} fallbackHeadline="Gira Clothing" />);
      advance(2500);
      pressKey("ArrowRight");
      advance(2500);
      expect(isShown(secondWord())).toBe(true);
      advance(500);
      expect(isShown(firstWord())).toBe(true);
    });

    it("no actúa con modificadores ni mientras se escribe en un campo", () => {
      render(
        <>
          <input aria-label="buscar" />
          <HeroCarousel hero={hero} fallbackHeadline="Gira Clothing" />
        </>,
      );
      pressKey("ArrowRight", { shiftKey: true });
      pressKey("ArrowRight", { metaKey: true });
      pressKey("ArrowRight", {}, screen.getByLabelText("buscar"));
      expect(isShown(firstWord())).toBe(true);
    });

    it("un deslizamiento horizontal con el dedo cambia de foto; uno vertical o con mouse no", () => {
      const { container } = render(<HeroCarousel hero={hero} fallbackHeadline="Gira Clothing" />);
      const section = container.querySelector("section") as HTMLElement;
      const drag = (from: [number, number], to: [number, number], pointerType = "touch") => {
        act(() => {
          fireEvent.pointerDown(section, { pointerType, clientX: from[0], clientY: from[1] });
          fireEvent.pointerUp(section, { pointerType, clientX: to[0], clientY: to[1] });
        });
      };
      drag([300, 400], [100, 410], "mouse");
      drag([200, 200], [190, 420]);
      drag([200, 400], [170, 400]);
      expect(isShown(firstWord())).toBe(true);
      drag([300, 400], [100, 410]);
      expect(isShown(secondWord())).toBe(true);
      drag([100, 400], [300, 405]);
      expect(isShown(firstWord())).toBe(true);
    });
  });

  it("una foto sin titular usa el nombre de la marca", () => {
    const blank = { slides: [{ ...hero.slides[0]!, headline: "  " }] };
    render(<HeroCarousel hero={blank} fallbackHeadline="Gira Clothing" />);
    expect(screen.getByText("Gira")).toBeInTheDocument();
    expect(screen.getByText("Clothing")).toBeInTheDocument();
  });
});

describe("HeroFallback", () => {
  it("muestra el titular y un botón a la tienda cuando no hay fotos", () => {
    render(<HeroFallback headline="Gira Clothing" />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ver tienda/ })).toHaveAttribute("href", "/tienda");
  });
});
