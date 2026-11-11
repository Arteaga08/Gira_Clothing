import { describe, it, expect } from "vitest";
import { buildStripeAppearance } from "@/lib/checkout/stripeAppearance";

const palette: Record<string, string> = {
  "--color-ink": "rgb(13, 13, 13)",
  "--color-surface": "rgb(245, 243, 238)",
  "--color-text-primary": "rgb(13, 13, 13)",
  "--color-text-muted": "rgb(107, 103, 92)",
  "--color-danger": "rgb(190, 50, 45)",
};
const read = (token: string): string => palette[token] ?? "rgb(1, 2, 3)";
const readers = { color: read, text: () => "'Space Grotesk', system-ui, sans-serif" };

describe("buildStripeAppearance", () => {
  const appearance = buildStripeAppearance(readers);

  it("toma los colores de los tokens del proyecto, no de valores propios", () => {
    expect(appearance.variables).toMatchObject({
      colorPrimary: palette["--color-ink"],
      colorText: palette["--color-text-primary"],
      colorDanger: palette["--color-danger"],
      colorTextSecondary: palette["--color-text-muted"],
    });
  });

  it("la tipografía sale del token de la tienda, no de un nombre escrito aquí", () => {
    expect(appearance.variables?.fontFamily).toBe("'Space Grotesk', system-ui, sans-serif");
  });

  it("es plana: sin sombras en ninguna regla", () => {
    expect(appearance.theme).toBe("flat");
    const rules = JSON.stringify(appearance.rules);
    expect(rules).not.toMatch(/boxShadow":"(?!none)/);
    expect(appearance.rules?.[".Input"]).toMatchObject({ boxShadow: "none" });
    expect(appearance.rules?.[".Input:focus"]).toMatchObject({ boxShadow: "none" });
  });

  it("los campos llevan el borde de tinta de 2px y el radio de los demás controles", () => {
    expect(appearance.rules?.[".Input"]).toMatchObject({ border: `2px solid ${palette["--color-ink"]}` });
    expect(appearance.variables?.borderRadius).toBe("8px");
  });

  it("un campo inválido se marca con el color de peligro", () => {
    expect(appearance.rules?.[".Input--invalid"]).toMatchObject({ border: `2px solid ${palette["--color-danger"]}` });
  });

  it("no usa var() ni oklch: el iframe de Stripe no los entiende", () => {
    expect(JSON.stringify(appearance)).not.toMatch(/var\(|oklch/);
  });
});
