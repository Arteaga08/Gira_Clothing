import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getNewArrivals } from "@/lib/api/storefront";
import { jsonResponse } from "../../helpers/fetchMock";

const product = (id: string, withCard: boolean) => ({
  id,
  name: id,
  slug: id,
  category: { id: "c", name: "Sudaderas", slug: "sudaderas", color: "tangerine" },
  measurements: {},
  materials: [],
  bestSeller: false,
  newArrival: true,
  cardTags: [],
  ...(withCard ? { card: { variantId: "v", images: [], price: 1000, isAvailable: true } } : {}),
});

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("getNewArrivals", () => {
  it("pide las 5 novedades más recientes y quita las que no tienen variante comprable", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { status: "success", message: "ok", data: { products: [product("a", true), product("b", false)] } }),
    );
    const result = await getNewArrivals();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://api.test/api/v1/catalog/products?newArrival=true&sort=-createdAt&limit=5");
    expect(result.map((item) => item.id)).toEqual(["a"]);
  });

  it("si el API falla, la sección simplemente no se pinta", async () => {
    fetchMock.mockRejectedValueOnce(new Error("caído"));
    expect(await getNewArrivals()).toEqual([]);
  });
});
