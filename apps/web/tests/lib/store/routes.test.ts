import { describe, expect, it } from "vitest";
import { STORE_ROUTES, withRedirect } from "@/lib/store/routes";

describe("withRedirect", () => {
  it("sin destino, o con el destino por defecto, deja la ruta limpia", () => {
    expect(withRedirect(STORE_ROUTES.register, undefined)).toBe("/crear-cuenta");
    expect(withRedirect(STORE_ROUTES.register, "/cuenta")).toBe("/crear-cuenta");
  });

  it("conserva un destino distinto, codificado", () => {
    expect(withRedirect(STORE_ROUTES.login, "/tienda?categoria=playeras")).toBe(
      "/ingresar?redirect=%2Ftienda%3Fcategoria%3Dplayeras",
    );
  });
});
