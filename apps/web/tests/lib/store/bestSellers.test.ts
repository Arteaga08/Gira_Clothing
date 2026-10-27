import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getBestSellers } from "@/lib/api/storefront";
import { jsonResponse } from "../../helpers/fetchMock";

const product = (id: string, withCard: boolean) => ({
  id,
  name: id,
  slug: id,
  category: { id: "c", name: "Playeras", slug: "playeras", color: "pink" },
  measurements: {},
  materials: [],
  bestSeller: true,
  newArrival: false,
  cardTags: [],
  ...(withCard ? { card: { variantId: "v", images: [], price: 1000, isAvailable: true } } : {}),
});

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("getBestSellers", () => {
  it("pide los marcados, del más nuevo al más viejo, y quita los que no tienen variante comprable", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { status: "success", message: "ok", data: { products: [product("a", true), product("b", false)] } }),
    );
    const result = await getBestSellers();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://api.test/api/v1/catalog/products?bestSeller=true&sort=-createdAt&limit=12");
    expect(result.map((item) => item.id)).toEqual(["a"]);
  });

  it("si el API falla, la sección simplemente no se pinta", async () => {
    fetchMock.mockRejectedValueOnce(new Error("caído"));
    expect(await getBestSellers()).toEqual([]);
  });
});
