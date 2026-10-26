import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OfferBannerView } from "@/components/store/offer-banner/OfferBannerView";

const banner = (extra: Record<string, unknown> = {}) => ({
  image: { url: "https://res.cloudinary.com/gira/image/upload/v1/home/offer.jpg", width: 2400, height: 900 },
  alt: "Modelo con playeras de Gira",
  message: "Rebajas de temporada",
  buttonLabel: "Comprar ahora",
  product: null,
  ...extra,
});

describe("OfferBannerView", () => {
  it("pinta la foto con su descripción, la frase una sola vez para lectores y, sin producto, el botón a la tienda", () => {
    const { container } = render(<OfferBannerView banner={banner()} />);
    expect(screen.getByRole("heading", { level: 2, name: "Ofertas" })).toBeInTheDocument();
    const photo = screen.getByRole("img", { name: "Modelo con playeras de Gira" });
    expect(photo.getAttribute("src")).toContain("/image/upload/c_limit,w_2400,f_auto,q_auto/v1/home/offer.jpg");

    // The moving copies are decorative; only the sr-only copy is exposed.
    expect(screen.getAllByText("Rebajas de temporada", { ignore: "[aria-hidden='true'] *" })).toHaveLength(1);
    const track = container.querySelector(".offer-marquee__track");
    expect(track).toHaveAttribute("aria-hidden", "true");
    expect(track?.querySelectorAll(".offer-marquee__group")).toHaveLength(2);

    const link = screen.getByRole("link", { name: "Comprar ahora" });
    expect(link).toHaveAttribute("href", "/tienda");
  });

  it("con producto el botón lleva a su ficha", () => {
    render(<OfferBannerView banner={banner({ product: { slug: "playera-flor", name: "Playera Flor" } })} />);
    expect(screen.getByRole("link", { name: "Comprar ahora" })).toHaveAttribute("href", "/tienda/playera-flor");
  });

  it("repite una frase corta para que el bucle cubra la pantalla", () => {
    const { container } = render(<OfferBannerView banner={banner({ message: "Rebajas" })} />);
    const firstGroup = container.querySelector(".offer-marquee__group");
    expect(firstGroup?.querySelectorAll("li").length).toBeGreaterThanOrEqual(9);
  });
});
