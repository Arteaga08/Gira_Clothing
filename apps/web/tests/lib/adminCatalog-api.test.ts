import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isApiError } from "@/lib/api/ApiError";
import { createPrint, fetchCatalogOptions, fetchCategoryOptions } from "@/lib/api/adminCatalog";
import { getEditorProduct, listProducts, reactivateProduct, retireProduct, updateProduct, createProduct } from "@/lib/api/adminProducts";
import { uploadImage } from "@/lib/api/adminUploads";
import { createVariant, listProductVariants, updateVariant } from "@/lib/api/adminVariants";
import { jsonResponse } from "../helpers/fetchMock";
import {
  PRODUCT_ID,
  PRINT_A_ID,
  VARIANT_A_ID,
  makeImage,
  makeRawProduct,
  makeRawVariant,
  PUBLIC_ID_SENTINEL,
  SLUG_SENTINEL,
} from "../helpers/catalog";

const ok = (data: unknown, meta?: unknown) => jsonResponse(200, { status: "success", message: "ok", data, ...(meta ? { meta } : {}) });

// `stubFetch()` restores fetch after the FIRST test when called at module level, so the stub is (re)installed per test.
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const lastCall = () => fetchMock.mock.calls.at(-1) as [string, RequestInit];

describe("adminProducts", () => {
  it("listProducts recorta cada fila en la frontera y conserva meta", async () => {
    fetchMock.mockResolvedValueOnce(ok({ products: [makeRawProduct()] }, { total: 1, page: 1, pages: 1, limit: 100 }));
    const { products, meta } = await listProducts("sort=category");
    expect(lastCall()[0]).toBe("http://api.test/api/v1/admin/products?sort=category");
    expect(products).toHaveLength(1);
    expect(JSON.stringify(products)).not.toContain(SLUG_SENTINEL);
    expect(JSON.stringify(products)).not.toContain(PUBLIC_ID_SENTINEL);
    expect(meta.total).toBe(1);
  });

  it("getEditorProduct valida el id antes de pedir nada", async () => {
    await expect(getEditorProduct("../x")).rejects.toSatisfy((failure) => isApiError(failure) && failure.kind === "parse");
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(ok({ product: makeRawProduct() }));
    expect((await getEditorProduct(PRODUCT_ID)).name).toBe("Cosmetiquera chica");
  });

  it("createProduct devuelve el id y manda el cuerpo como JSON", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { status: "success", message: "ok", data: { product: makeRawProduct() } }));
    const id = await createProduct({
      name: "X",
      category: "c",
      description: "",
      basePrice: 100,
      weightGrams: 10,
      bestSeller: false,
      newArrival: false,
      cardTags: [],
      cardPrint: null,
      measurements: {},
      materials: [],
    });
    expect(id).toBe(PRODUCT_ID);
    const [url, init] = lastCall();
    expect(url).toBe("http://api.test/api/v1/admin/products");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
  });

  it("updateProduct, retireProduct y reactivateProduct usan PATCH/DELETE sobre el id", async () => {
    fetchMock.mockResolvedValue(ok({ product: makeRawProduct() }));
    await updateProduct(PRODUCT_ID, { name: "Nuevo" });
    expect(lastCall()[1].method).toBe("PATCH");
    await retireProduct(PRODUCT_ID);
    expect(lastCall()[1].method).toBe("DELETE");
    await reactivateProduct(PRODUCT_ID);
    expect(lastCall()[1].method).toBe("PATCH");
    expect(lastCall()[1].body).toBe(JSON.stringify({ isActive: true }));
  });

  it("retireProduct propaga el 409 del API con su mensaje", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(409, { status: "fail", message: "No puedes retirar un producto con variantes activas." }));
    await expect(retireProduct(PRODUCT_ID)).rejects.toMatchObject({ status: 409, message: /variantes activas/ });
  });
});

describe("adminVariants (catálogo)", () => {
  it("listProductVariants pide las imágenes y todas las variantes del modelo", async () => {
    fetchMock.mockResolvedValueOnce(ok({ variants: [makeRawVariant()] }));
    const variants = await listProductVariants(PRODUCT_ID);
    const url = new URL(lastCall()[0]);
    expect(url.searchParams.get("product")).toBe(PRODUCT_ID);
    expect(url.searchParams.get("withImages")).toBe("true");
    expect(url.searchParams.has("isActive")).toBe(false);
    expect(variants[0]).toMatchObject({ printId: PRINT_A_ID, sku: "COSMETIQUERA-CHICA-NOP" });
    expect(variants[0]?.images).toHaveLength(2);
  });

  it("createVariant y updateVariant devuelven la variante del editor", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { status: "success", message: "ok", data: { variant: makeRawVariant() } }));
    const created = await createVariant({ product: PRODUCT_ID, print: PRINT_A_ID, images: [], priceOverride: 100 });
    expect(created.id).toBe(VARIANT_A_ID);
    expect(lastCall()[1].method).toBe("POST");
    fetchMock.mockResolvedValueOnce(ok({ variant: makeRawVariant({ isActive: false }) }));
    const updated = await updateVariant(VARIANT_A_ID, { priceOverride: null });
    expect(updated.isActive).toBe(false);
    expect(lastCall()[1].body).toBe(JSON.stringify({ priceOverride: null }));
  });

  it("updateVariant valida el id", async () => {
    await expect(updateVariant("nope", { isActive: false })).rejects.toMatchObject({ kind: "parse" });
  });
});

describe("adminCatalog", () => {
  it("fetchCatalogOptions pide categorías, familias y estampas activas", async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ categories: [{ id: "c1", name: "Totes", slug: "t", isActive: true }] }))
      .mockResolvedValueOnce(ok({ families: [{ id: "f1", name: "Flora", slug: "f", isActive: true }] }))
      .mockResolvedValueOnce(
        ok({ prints: [{ id: "p1", name: "Nopal", slug: "n", sku: "NOP", family: { id: "f1", name: "Flora", slug: "f" }, image: makeImage("n"), isActive: true }] }),
      );
    const options = await fetchCatalogOptions();
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((u) => u.includes("/admin/product-categories?isActive=true"))).toBe(true);
    expect(urls.some((u) => u.includes("/admin/print-families?isActive=true"))).toBe(true);
    expect(urls.some((u) => u.includes("/admin/prints?isActive=true"))).toBe(true);
    expect(options.prints[0]?.familyName).toBe("Flora");
  });

  it("fetchCategoryOptions solo pide categorías", async () => {
    fetchMock.mockResolvedValueOnce(ok({ categories: [{ id: "c1", name: "Totes", slug: "t", isActive: true }] }));
    expect(await fetchCategoryOptions()).toEqual([{ value: "c1", label: "Totes" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("createPrint devuelve la estampa lista para el selector", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, {
        status: "success",
        message: "ok",
        data: { print: { id: "p9", name: "Cassette", slug: "c", sku: "CAS", family: { id: "f1", name: "Retro", slug: "r" }, image: makeImage("c"), isActive: true } },
      }),
    );
    const print = await createPrint({ name: "Cassette", sku: "CAS", family: "f1", image: makeImage("c") });
    expect(print).toMatchObject({ id: "p9", familyName: "Retro" });
  });
});

describe("adminUploads", () => {
  it("manda un multipart con folder y file, sin content-type manual", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { status: "success", message: "ok", data: { image: makeImage("subida") } }));
    const file = new File(["x"], "foto.png", { type: "image/png" });
    const image = await uploadImage(file, "variants");
    expect(image.publicId).toBe("gira/subida");
    const [url, init] = lastCall();
    expect(url).toBe("http://api.test/api/v1/admin/uploads");
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.get("folder")).toBe("variants");
    expect((form.get("file") as File).name).toBe("foto.png");
    expect((init.headers as Record<string, string>)["content-type"]).toBeUndefined();
  });
});
