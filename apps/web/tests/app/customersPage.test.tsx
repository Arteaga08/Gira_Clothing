import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import ClientesPage from "@/app/(admin)/clientes/page";

/** Props that cross the server -> client boundary must be plain data: a function in them crashes the page at runtime. */
const functionPaths = (value: unknown, path = "props"): string[] => {
  if (typeof value === "function") return [path];
  if (Array.isArray(value)) return value.flatMap((item, index) => functionPaths(item, `${path}[${index}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => functionPaths(child, `${path}.${key}`));
  }
  return [];
};

const clientElement = (page: ReactElement): ReactElement => (page.props as { children: ReactElement }).children;

describe("Clientes · página del servidor", () => {
  it("pasa al cliente solo datos serializables", async () => {
    const element = clientElement(await ClientesPage({ searchParams: Promise.resolve({}) }));
    expect(functionPaths(element.props)).toEqual([]);
    expect(element.props).toMatchObject({ initialFilters: { period: "month", sortBy: "spent", page: 1 } });
  });

  it("lee periodo, orden y búsqueda de la URL", async () => {
    const element = clientElement(
      await ClientesPage({ searchParams: Promise.resolve({ periodo: "semana", orden: "compras", q: "ana" }) }),
    );
    expect(element.props).toMatchObject({ initialFilters: { period: "week", sortBy: "orders", search: "ana" } });
  });
});
