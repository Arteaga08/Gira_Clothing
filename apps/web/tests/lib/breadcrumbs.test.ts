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

  it("en /pedidos/68f2ab: nunca muestra el id crudo, dice Detalle", () => {
    expect(breadcrumbsFor("/pedidos/68f2ab")).toEqual([
      { label: "Panel", href: "/resumen" },
      { label: "Pedidos", href: "/pedidos" },
      { label: "Detalle" },
    ]);
  });

  it("con etiqueta propia (el folio) reemplaza el último segmento", () => {
    expect(breadcrumbsFor("/pedidos/68f2ab", "GC-7KQ3M2XV")).toEqual([
      { label: "Panel", href: "/resumen" },
      { label: "Pedidos", href: "/pedidos" },
      { label: "GC-7KQ3M2XV" },
    ]);
  });

  it("la etiqueta propia no pisa una sección del registro", () => {
    expect(breadcrumbsFor("/pedidos", "GC-7KQ3M2XV").at(-1)).toEqual({ label: "Pedidos" });
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
