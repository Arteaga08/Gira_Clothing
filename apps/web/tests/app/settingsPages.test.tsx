import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import AjustesPage from "@/app/(admin)/ajustes/page";

const clientElement = (page: ReactElement): ReactElement => (page.props as { children: ReactElement }).children;

describe("Ajustes · página del servidor", () => {
  it("lee ?seccion= y descarta valores desconocidos", async () => {
    const open = clientElement(await AjustesPage({ searchParams: Promise.resolve({ seccion: "envio" }) }));
    expect(open.props).toEqual({ initialSection: "envio" });
    const unknown = clientElement(await AjustesPage({ searchParams: Promise.resolve({ seccion: "moneda" }) }));
    expect(unknown.props).toEqual({ initialSection: undefined });
  });
});

describe("Auditoría · página del servidor", () => {
  it("pasa al cliente solo datos planos leídos de la URL", async () => {
    const { default: AuditoriaPage } = await import("@/app/(admin)/auditoria/page");
    const id = "68f2ab12c3d4e5f6a7b8caa1";
    const element = clientElement(
      await AuditoriaPage({ searchParams: Promise.resolve({ quien: "sistema", periodo: "7", registro: id }) }),
    );
    expect(element.props).toEqual({ initialFilters: { actor: "system", period: 7, page: 1 }, initialSelected: id });
  });
});
