import { describe, expect, it } from "vitest";
import { offerBannerSignature, parseOfferBanner } from "@/lib/settings/offerBanner";

const IMAGE = { url: "https://res.cloudinary.com/gira/image/upload/a.jpg", publicId: "gira/home/a", width: 2400, height: 900 };

const banner = (extra: Record<string, unknown> = {}) => ({
  enabled: true,
  image: IMAGE,
  alt: "Modelo con playeras",
  message: "Rebajas de temporada",
  buttonLabel: "Comprar ahora",
  productId: null,
  ...extra,
});

const INCOMPLETE = "Para mostrar el banner completa la foto, su descripción, la frase y el botón.";

describe("parseOfferBanner", () => {
  it("recorta los textos", () => {
    expect(parseOfferBanner(banner({ message: "  Rebajas  ", buttonLabel: " Comprar ahora " }))).toEqual({
      banner: banner({ message: "Rebajas" }),
    });
  });

  it("guarda el producto elegido; sin producto (\"\") manda null y el botón lleva a la tienda", () => {
    expect(parseOfferBanner(banner({ productId: "p1" }))).toEqual({ banner: banner({ productId: "p1" }) });
    expect(parseOfferBanner(banner({ productId: "" }))).toEqual({ banner: banner() });
  });

  it.each([
    ["foto", { image: null }],
    ["descripción", { alt: " " }],
    ["frase", { message: "" }],
    ["botón", { buttonLabel: "" }],
  ])("visible sin %s no pasa", (_name, extra) => {
    expect(parseOfferBanner(banner(extra))).toEqual({ error: INCOMPLETE });
  });

  it("oculto puede ir a medio llenar", () => {
    const draft = { enabled: false, image: null, alt: "", message: "Borrador", buttonLabel: "", productId: null };
    expect(parseOfferBanner(draft)).toEqual({ banner: draft });
  });

  it("rechaza una frase de más de 80 caracteres", () => {
    expect(parseOfferBanner(banner({ message: "x".repeat(81) }))).toEqual({
      error: "La frase admite hasta 80 caracteres.",
    });
  });
});

describe("offerBannerSignature", () => {
  it("los espacios de los extremos no cuentan como cambio", () => {
    expect(offerBannerSignature(banner({ message: " Rebajas de temporada " }))).toBe(offerBannerSignature(banner()));
  });
});
