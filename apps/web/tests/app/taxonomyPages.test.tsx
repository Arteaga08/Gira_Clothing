import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import CategoriasPage from "@/app/(admin)/categorias/page";
import FamiliasPage from "@/app/(admin)/familias/page";

/** Props that cross the server -> client boundary must be plain data: a function in them crashes the page at runtime. */
const functionPaths = (value: unknown, path = "props"): string[] => {
  if (typeof value === "function") return [path];
  if (Array.isArray(value)) return value.flatMap((item, index) => functionPaths(item, `${path}[${index}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => functionPaths(child, `${path}.${key}`));
  }
  return [];
};

/** The page's own client element is the child of the ErrorBoundary. */
const clientElement = (page: ReactElement): ReactElement =>
  (page.props as { children: ReactElement }).children;

describe.each([
  ["Familias", FamiliasPage, "family", "familia"],
  ["Categorías", CategoriasPage, "category", "categoria"],
])("%s · página del servidor", (_name, Page, kind, param) => {
  it("pasa al cliente solo datos serializables", async () => {
    const element = clientElement(await Page({ searchParams: Promise.resolve({}) }));
    expect(functionPaths(element.props)).toEqual([]);
    expect(element.props).toMatchObject({ kind });
  });

  it("lee el registro abierto de su propio parámetro de la URL", async () => {
    const id = "68f2ab12c3d4e5f6a7b8c9e1";
    const element = clientElement(await Page({ searchParams: Promise.resolve({ [param]: id }) }));
    expect(element.props).toMatchObject({ initialSelected: id });
  });
});
