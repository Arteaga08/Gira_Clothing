import { describe, expect, it } from "vitest";
import { resolveRedirect } from "@/lib/store/safeRedirect";

describe("resolveRedirect", () => {
  it.each([
    ["/", "/"],
    ["/tienda", "/tienda"],
    ["/tienda?categoria=playeras&pagina=2", "/tienda?categoria=playeras&pagina=2"],
    ["/tienda/playera-clasica", "/tienda/playera-clasica"],
    ["/cuenta", "/cuenta"],
    ["/cuenta/pedidos", "/cuenta/pedidos"],
    ["/carrito", "/carrito"],
    ["/checkout", "/checkout"],
  ])("deja pasar la ruta de la tienda %s", (raw, expected) => {
    expect(resolveRedirect(raw)).toBe(expected);
  });

  it.each([
    ["//evil.com"],
    ["https://evil.com/cuenta"],
    ["/\\evil.com"],
    ["/\\/evil.com"],
    ["javascript:alert(1)"],
    ["cuenta"],
    ["/tiendafalsa"],
    ["/ingresar"],
    ["/crear-cuenta"],
    ["/verificar-correo?token=x"],
    ["/restablecer-contrasena"],
    ["/resumen"],
    ["/admin"],
    ["/tienda/../ingresar"],
    ["/tienda\n"],
    ["/tienda\u0000"],
    [`/tienda?x=${"a".repeat(600)}`],
  ])("rechaza %j y cae al respaldo", (raw) => {
    expect(resolveRedirect(raw)).toBe("/cuenta");
  });

  it("sin valor, con arreglo (parámetro repetido) o vacío usa el respaldo", () => {
    expect(resolveRedirect(undefined)).toBe("/cuenta");
    expect(resolveRedirect(["/tienda", "/carrito"])).toBe("/cuenta");
    expect(resolveRedirect("")).toBe("/cuenta");
  });

  it("acepta un respaldo propio", () => {
    expect(resolveRedirect("//x", "/")).toBe("/");
  });

  it("descarta el fragmento", () => {
    expect(resolveRedirect("/tienda#arriba")).toBe("/tienda");
  });
});
