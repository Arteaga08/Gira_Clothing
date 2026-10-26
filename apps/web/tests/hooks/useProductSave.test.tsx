import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/ApiError";
import { toEditorProduct, toExistingVariant } from "@/lib/catalog/editorProduct";
import {
  addPrint,
  emptyFormState,
  removePrint,
  setDraftImages,
  setDraftPrice,
  stateFromBaseline,
  type ModelFields,
  type ProductFormState,
} from "@/lib/catalog/productForm";
import { useProductSave } from "@/hooks/useProductSave";
import {
  CATEGORY_ID,
  PRINT_A_ID,
  PRINT_B_ID,
  PRODUCT_ID,
  VARIANT_A_ID,
  makeImage,
  makeRawProduct,
  makeRawVariant,
} from "../helpers/catalog";

const products = vi.hoisted(() => ({ createProduct: vi.fn(), updateProduct: vi.fn() }));
vi.mock("@/lib/api/adminProducts", () => products);
const variants = vi.hoisted(() => ({ createVariant: vi.fn(), updateVariant: vi.fn() }));
vi.mock("@/lib/api/adminVariants", () => variants);

const MODEL: ModelFields = {
  name: "Cosmetiquera chica",
  categoryId: CATEGORY_ID,
  description: "",
  price: "189.00",
  weight: "140",
  width: "",
  height: "",
  depth: "",
  materials: "",
  bestSeller: false,
  newArrival: false,
  cardTags: ["", "", ""],
  cardPrintId: "",
};
const NAMES = new Map([
  [PRINT_A_ID, "Nopal en flor"],
  [PRINT_B_ID, "Monarca"],
]);

const newState = (): ProductFormState => {
  let state: ProductFormState = { ...emptyFormState(), model: MODEL };
  state = setDraftPrice(addPrint(state, PRINT_A_ID, []), PRINT_A_ID, "209.00");
  state = setDraftImages(state, PRINT_A_ID, [makeImage("a")]);
  return addPrint(state, PRINT_B_ID, []);
};

beforeEach(() => {
  Object.values(products).forEach((mock) => mock.mockReset());
  Object.values(variants).forEach((mock) => mock.mockReset());
});

describe("useProductSave · crear", () => {
  it("crea el modelo y luego una variante por estampa, en orden", async () => {
    products.createProduct.mockResolvedValue(PRODUCT_ID);
    variants.createVariant.mockResolvedValue({});
    const { result } = renderHook(() => useProductSave());
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.saveNew(newState(), NAMES);
    });
    expect(outcome).toEqual({ ok: true, productId: PRODUCT_ID, failures: [] });
    expect(products.createProduct).toHaveBeenCalledWith(expect.objectContaining({ name: "Cosmetiquera chica", basePrice: 18900 }));
    expect(variants.createVariant).toHaveBeenNthCalledWith(1, {
      product: PRODUCT_ID,
      print: PRINT_A_ID,
      images: [makeImage("a")],
      priceOverride: 20900,
    });
    expect(variants.createVariant).toHaveBeenNthCalledWith(2, { product: PRODUCT_ID, print: PRINT_B_ID, images: [] });
  });

  it("si una variante falla, el resto sigue y el fallo nombra la estampa", async () => {
    products.createProduct.mockResolvedValue(PRODUCT_ID);
    variants.createVariant
      .mockRejectedValueOnce(new ApiError("Ya existe una variante con ese SKU.", "http", 409))
      .mockResolvedValueOnce({});
    const { result } = renderHook(() => useProductSave());
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.saveNew(newState(), NAMES);
    });
    expect(outcome).toEqual({
      ok: true,
      productId: PRODUCT_ID,
      failures: [{ printName: "Nopal en flor", message: "Ya existe una variante con ese SKU." }],
    });
    expect(variants.createVariant).toHaveBeenCalledTimes(2);
  });

  it("si el modelo no se crea, no se intenta ninguna variante", async () => {
    products.createProduct.mockRejectedValue(new ApiError("La categoría no existe.", "http", 400));
    const { result } = renderHook(() => useProductSave());
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.saveNew(newState(), NAMES);
    });
    expect(outcome).toEqual({ ok: false, message: "La categoría no existe." });
    expect(variants.createVariant).not.toHaveBeenCalled();
  });

  it("un segundo guardado mientras hay uno en curso se rechaza", async () => {
    let finish: (id: string) => void = () => {};
    products.createProduct.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    variants.createVariant.mockResolvedValue({});
    const { result } = renderHook(() => useProductSave());
    let first: Promise<unknown> = Promise.resolve();
    act(() => {
      first = result.current.saveNew(newState(), NAMES);
    });
    let second: unknown;
    await act(async () => {
      second = await result.current.saveNew(newState(), NAMES);
    });
    expect(second).toEqual({ ok: false, message: "Ya hay un guardado en curso." });
    await act(async () => {
      finish(PRODUCT_ID);
      await first;
    });
    expect(products.createProduct).toHaveBeenCalledTimes(1);
  });
});

describe("useProductSave · editar", () => {
  const existing = toExistingVariant(makeRawVariant({ images: [makeImage("a1")] }));
  const baseline = { product: toEditorProduct(makeRawProduct()), variants: [existing] };

  it("sin cambios no hace ninguna petición", async () => {
    const { result } = renderHook(() => useProductSave());
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.saveExisting(PRODUCT_ID, stateFromBaseline(baseline), baseline, NAMES);
    });
    expect(outcome).toEqual({ ok: true, productId: PRODUCT_ID, failures: [] });
    expect(products.updateProduct).not.toHaveBeenCalled();
    expect(variants.updateVariant).not.toHaveBeenCalled();
  });

  it("solo manda lo que cambió y retira las estampas deseleccionadas", async () => {
    products.updateProduct.mockResolvedValue(undefined);
    variants.updateVariant.mockResolvedValue({});
    const state = removePrint(stateFromBaseline(baseline), PRINT_A_ID);
    const renamed = { ...state, model: { ...state.model, name: "Cosmetiquera mini" } };
    const { result } = renderHook(() => useProductSave());
    await act(async () => {
      await result.current.saveExisting(PRODUCT_ID, renamed, baseline, NAMES);
    });
    expect(products.updateProduct).toHaveBeenCalledWith(PRODUCT_ID, { name: "Cosmetiquera mini" });
    expect(variants.updateVariant).toHaveBeenCalledWith(VARIANT_A_ID, { isActive: false });
  });

  it("si el PATCH del modelo falla, no toca las variantes", async () => {
    products.updateProduct.mockRejectedValue(new ApiError("El nombre es obligatorio.", "http", 400));
    const state = stateFromBaseline(baseline);
    const renamed = removePrint({ ...state, model: { ...state.model, name: "Otro" } }, PRINT_A_ID);
    const { result } = renderHook(() => useProductSave());
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.saveExisting(PRODUCT_ID, renamed, baseline, NAMES);
    });
    expect(outcome).toEqual({ ok: false, message: "El nombre es obligatorio." });
    expect(variants.updateVariant).not.toHaveBeenCalled();
  });
});
