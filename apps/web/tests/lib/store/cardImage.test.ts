import { describe, expect, it } from "vitest";
import { cardImageUrl } from "@/components/store/best-sellers/cardImage";

describe("cardImageUrl", () => {
  it("pide a Cloudinary el recorte de la card", () => {
    expect(cardImageUrl("https://res.cloudinary.com/x/image/upload/v1/gira/a.png")).toBe(
      "https://res.cloudinary.com/x/image/upload/c_fill,w_640,h_800,f_auto,q_auto/v1/gira/a.png",
    );
  });

  it("no toca una URL que ya trae transformación ni una que no es de Cloudinary", () => {
    const transformed = "https://res.cloudinary.com/x/image/upload/w_100,f_auto/v1/a.png";
    expect(cardImageUrl(transformed)).toBe(transformed);
    expect(cardImageUrl("https://example.com/a.png")).toBe("https://example.com/a.png");
  });
});
