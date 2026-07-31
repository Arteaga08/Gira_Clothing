import { describe, expect, it } from "vitest";
import { breadcrumbsFor } from "@/lib/breadcrumbs";

describe("breadcrumbsFor", () => {
  it("en /resumen: Panel enlazado + Resumen actual", () => {
    expect(breadcrumbsFor("/resumen")).toEqual([
      { label: "Panel", href: "/resumen" },
      { label: "Resumen" },
    ]);
  });

  it("en /pedidos: Panel enlazado + Pedidos actual (label del registro)", () => {
    expect(breadcrumbsFor("/pedidos")).toEqual([
      { label: "Panel", href: "/resumen" },
      { label: "Pedidos" },
    ]);
  });

  it("en /pedidos/68f2ab: Panel, Pedidos enlazado, y el segmento crudo como actual", () => {
    expect(breadcrumbsFor("/pedidos/68f2ab")).toEqual([
      { label: "Panel", href: "/resumen" },
      { label: "Pedidos", href: "/pedidos" },
      { label: "68f2ab" },
    ]);
  });

  it("una ruta que no existe en el registro no lanza: usa el segmento crudo", () => {
    expect(breadcrumbsFor("/ruta-inventada")).toEqual([
      { label: "Panel", href: "/resumen" },
      { label: "ruta-inventada" },
    ]);
  });

  it("el último crumb nunca lleva href", () => {
    const crumbs = breadcrumbsFor("/pedidos/68f2ab");
    expect(crumbs.at(-1)).not.toHaveProperty("href");
  });
});
