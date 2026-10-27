import { describe, expect, it } from "vitest";
import { buildFooterColumns } from "@/lib/store/footerLinks";
import { STORE_SOCIAL, activeSocialNetworks } from "@/lib/store/socialLinks";

const category = (n: number) => ({ name: `Categoría ${n}`, slug: `cat-${n}` });

describe("buildFooterColumns", () => {
  it("arma Tienda, Ayuda, Cuenta y Legal en ese orden", () => {
    expect(buildFooterColumns([]).map((column) => column.title)).toEqual(["Tienda", "Ayuda", "Cuenta", "Legal"]);
  });

  it("Tienda lleva hasta 4 categorías reales, luego Novedades y Toda la tienda", () => {
    const shop = buildFooterColumns([1, 2, 3, 4, 5].map(category))[0];
    expect(shop?.links.map((link) => link.label)).toEqual([
      "Categoría 1",
      "Categoría 2",
      "Categoría 3",
      "Categoría 4",
      "Novedades",
      "Toda la tienda",
    ]);
    expect(shop?.links[0]?.href).toBe("/tienda?categoria=cat-1");
  });

  it("sin categorías (API caída) quedan los enlaces fijos", () => {
    expect(buildFooterColumns([])[0]?.links.map((link) => link.href)).toEqual(["/tienda?novedad=si", "/tienda"]);
  });
});

describe("activeSocialNetworks", () => {
  it("solo deja las redes con enlace", () => {
    const networks = STORE_SOCIAL.map((network) =>
      network.key === "instagram" ? { ...network, href: "https://instagram.com/gira" } : network,
    );
    expect(activeSocialNetworks(networks).map((network) => network.key)).toEqual(["instagram"]);
  });
});
