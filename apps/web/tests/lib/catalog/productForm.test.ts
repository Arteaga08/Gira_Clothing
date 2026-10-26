import { describe, expect, it } from "vitest";
import { toEditorProduct, toExistingVariant, type ExistingVariant } from "@/lib/catalog/editorProduct";
import {
  addPrint,
  appendDraftImages,
  emptyFormState,
  isDirty,
  planVariantChanges,
  removePrint,
  setDraftImages,
  setDraftPrice,
  stateFromBaseline,
  toCreateBody,
  toUpdateBody,
  validateModel,
  validateVariantPrices,
  type ModelFields,
  type ProductBaseline,
} from "@/lib/catalog/productForm";
import {
  CATEGORY_ID,
  PRINT_A_ID,
  PRINT_B_ID,
  VARIANT_A_ID,
  VARIANT_B_ID,
  makeImage,
  makeRawProduct,
  makeRawVariant,
} from "../../helpers/catalog";

const VALID: ModelFields = {
  name: "Cosmetiquera chica",
  categoryId: CATEGORY_ID,
  description: "",
  price: "189.00",
  weight: "140",
  width: "18",
  height: "11",
  depth: "6",
  materials: "Lona de algodón, forro impermeable",
  bestSeller: false,
  newArrival: false,
  cardTags: ["", "", ""],
  cardPrintId: "",
};

const baseline = (variants: ExistingVariant[] = []): ProductBaseline => ({
  product: toEditorProduct(makeRawProduct({ description: undefined as never })),
  variants,
});

const existingA = toExistingVariant(makeRawVariant({ images: [makeImage("a1")] }));
const existingB = toExistingVariant(
  makeRawVariant({ id: VARIANT_B_ID, print: { id: PRINT_B_ID, name: "Monarca", sku: "MON", image: makeImage("m") }, images: [], isActive: false }),
);

describe("validateModel", () => {
  it("un modelo completo no tiene errores", () => {
    expect(validateModel(VALID)).toEqual({});
  });

  it("nombre, categoría, precio y peso son obligatorios", () => {
    const errors = validateModel({ ...VALID, name: "A", categoryId: "", price: "abc", weight: "" });
    expect(errors.name).toMatch(/al menos 2/);
    expect(errors.categoryId).toBe("Elige una categoría.");
    expect(errors.price).toMatch(/precio en pesos/);
    expect(errors.weight).toBe("Indica el peso en gramos para cotizar el envío.");
  });

  it("respeta los límites del API", () => {
    expect(validateModel({ ...VALID, price: "100000.01" }).price).toMatch(/no puede pasar/);
    expect(validateModel({ ...VALID, weight: "0" }).weight).toMatch(/entre 1 y 20000/);
    expect(validateModel({ ...VALID, weight: "20001" }).weight).toMatch(/entre 1 y 20000/);
    expect(validateModel({ ...VALID, width: "501" }).width).toMatch(/0 y 500/);
    expect(validateModel({ ...VALID, name: "x".repeat(121) }).name).toMatch(/120/);
    expect(validateModel({ ...VALID, description: "x".repeat(2001) }).description).toMatch(/2000/);
  });

  it("las medidas son opcionales pero no pueden ser basura", () => {
    expect(validateModel({ ...VALID, width: "", height: "", depth: "" })).toEqual({});
    expect(validateModel({ ...VALID, height: "ancho" }).height).toMatch(/0 y 500/);
  });

  it("máximo 10 materiales de hasta 60 caracteres", () => {
    expect(validateModel({ ...VALID, materials: Array.from({ length: 11 }, (_, i) => `m${i}`).join(",") }).materials).toMatch(/10/);
    expect(validateModel({ ...VALID, materials: "y".repeat(61) }).materials).toMatch(/60/);
  });
});

describe("validateVariantPrices", () => {
  it("vacío vale (usa el precio base); texto inválido o fuera de rango no", () => {
    const state = addPrint(addPrint(addPrint(emptyFormState(), PRINT_A_ID, []), PRINT_B_ID, []), "p3", []);
    const withPrices = setDraftPrice(setDraftPrice(setDraftPrice(state, PRINT_A_ID, ""), PRINT_B_ID, "abc"), "p3", "100001");
    const errors = validateVariantPrices(withPrices.selected);
    expect(errors[PRINT_A_ID]).toBeUndefined();
    expect(errors[PRINT_B_ID]).toMatch(/precio en pesos/);
    expect(errors.p3).toMatch(/no puede pasar/);
  });
});

describe("toCreateBody", () => {
  it("convierte pesos a centavos y arma materiales y medidas", () => {
    const state = { ...emptyFormState(), model: VALID };
    expect(toCreateBody(state)).toEqual({
      name: "Cosmetiquera chica",
      category: CATEGORY_ID,
      description: "",
      basePrice: 18900,
      weightGrams: 140,
      measurements: { widthCm: 18, heightCm: 11, depthCm: 6 },
      materials: ["Lona de algodón", "forro impermeable"],
      bestSeller: false,
      newArrival: false,
      cardTags: [],
      cardPrint: null,
    });
  });

  it("manda la marca de más vendido, las palabras recortadas sin vacías y la variante de la card", () => {
    const body = toCreateBody({
      ...emptyFormState(),
      model: { ...VALID, bestSeller: true, cardTags: [" Fresca ", "", "Suave"], cardPrintId: PRINT_A_ID },
    });
    expect(body).toMatchObject({ bestSeller: true, cardTags: ["Fresca", "Suave"], cardPrint: PRINT_A_ID });
  });

  it("rechaza una palabra de card de más de 20 caracteres", () => {
    expect(validateModel({ ...VALID, cardTags: ["x".repeat(21), "", ""] }).cardTags).toMatch(/20/);
  });

  it("al quitar la estampa de la card, la card vuelve a automática", () => {
    const state = {
      ...emptyFormState(),
      model: { ...VALID, cardPrintId: PRINT_A_ID },
      selected: [{ printId: PRINT_A_ID, priceOverride: "", images: [] }],
    };
    expect(removePrint(state, PRINT_A_ID).model.cardPrintId).toBe("");
  });

  it("omite las medidas vacías e incluye la foto de tamaño si hay", () => {
    const body = toCreateBody({
      ...emptyFormState(),
      model: { ...VALID, width: "", depth: "" },
      sizeImage: makeImage("tamano"),
    });
    expect(body.measurements).toEqual({ heightCm: 11 });
    expect(body.sizeImage?.publicId).toBe("gira/tamano");
  });
});

describe("toUpdateBody", () => {
  it("sin cambios devuelve null", () => {
    expect(toUpdateBody(stateFromBaseline(baseline()), baseline())).toBeNull();
  });

  it("solo manda lo que cambió", () => {
    const state = stateFromBaseline(baseline());
    const next = { ...state, model: { ...state.model, name: "Cosmetiquera mini", price: "150" } };
    expect(toUpdateBody(next, baseline())).toEqual({ name: "Cosmetiquera mini", basePrice: 15000 });
  });

  it("quitar la foto de tamaño manda null y reemplazarla manda la nueva", () => {
    const base = { ...baseline(), product: { ...baseline().product, sizeImage: makeImage("vieja") } };
    const state = stateFromBaseline(base);
    expect(toUpdateBody({ ...state, sizeImage: null }, base)).toEqual({ sizeImage: null });
    expect(toUpdateBody({ ...state, sizeImage: makeImage("nueva") }, base)).toEqual({ sizeImage: makeImage("nueva") });
  });
});

describe("selección de estampas", () => {
  it("elegir una estampa nueva crea un borrador vacío y no duplica", () => {
    const once = addPrint(emptyFormState(), PRINT_A_ID, []);
    expect(once.selected).toEqual([{ printId: PRINT_A_ID, priceOverride: "", images: [] }]);
    expect(addPrint(once, PRINT_A_ID, []).selected).toHaveLength(1);
  });

  it("volver a elegir una estampa con variante retirada recupera su precio y fotos", () => {
    const retired: ExistingVariant = { ...existingB, priceOverride: 20900, images: [makeImage("m1")] };
    const state = addPrint(emptyFormState(), PRINT_B_ID, [retired]);
    expect(state.selected[0]).toEqual({ printId: PRINT_B_ID, priceOverride: "209.00", images: [makeImage("m1")] });
  });

  it("quitar la estampa la saca de la selección", () => {
    const state = removePrint(addPrint(emptyFormState(), PRINT_A_ID, []), PRINT_A_ID);
    expect(state.selected).toEqual([]);
  });

  it("appendDraftImages suma al final contra el estado más reciente", () => {
    let state = addPrint(addPrint(emptyFormState(), PRINT_A_ID, []), PRINT_B_ID, []);
    state = setDraftImages(state, PRINT_A_ID, [makeImage("x")]);
    const next = appendDraftImages(state, PRINT_A_ID, [makeImage("y"), makeImage("z")]);
    expect(next.selected.find((d) => d.printId === PRINT_A_ID)?.images).toEqual([makeImage("x"), makeImage("y"), makeImage("z")]);
    expect(next.selected.find((d) => d.printId === PRINT_B_ID)?.images).toEqual([]);
  });

  it("setDraftImages reemplaza solo las fotos de esa estampa", () => {
    const state = addPrint(addPrint(emptyFormState(), PRINT_A_ID, []), PRINT_B_ID, []);
    const next = setDraftImages(state, PRINT_B_ID, [makeImage("x")]);
    expect(next.selected.find((d) => d.printId === PRINT_A_ID)?.images).toEqual([]);
    expect(next.selected.find((d) => d.printId === PRINT_B_ID)?.images).toEqual([makeImage("x")]);
  });
});

describe("planVariantChanges", () => {
  it("una estampa elegida sin variante se crea con su precio y fotos", () => {
    let state = addPrint(emptyFormState(), PRINT_A_ID, []);
    state = setDraftPrice(state, PRINT_A_ID, "209.00");
    state = setDraftImages(state, PRINT_A_ID, [makeImage("n")]);
    const plan = planVariantChanges(state.selected, []);
    expect(plan.create).toEqual([{ printId: PRINT_A_ID, priceOverride: 20900, images: [makeImage("n")] }]);
    expect(plan.update).toEqual([]);
    expect(plan.retire).toEqual([]);
  });

  it("sin precio especial no manda priceOverride al crear", () => {
    const plan = planVariantChanges(addPrint(emptyFormState(), PRINT_A_ID, []).selected, []);
    expect(plan.create[0]).not.toHaveProperty("priceOverride");
  });

  it("una variante activa sin cambios no genera operaciones", () => {
    const state = stateFromBaseline(baseline([existingA]));
    expect(planVariantChanges(state.selected, [existingA])).toEqual({ create: [], update: [], retire: [] });
  });

  it("cambiar fotos o precio actualiza; quitar el precio manda null", () => {
    const withPrice = { ...existingA, priceOverride: 25000 };
    let state = stateFromBaseline(baseline([withPrice]));
    state = setDraftPrice(state, PRINT_A_ID, "");
    state = setDraftImages(state, PRINT_A_ID, [makeImage("a2"), makeImage("a1")]);
    const plan = planVariantChanges(state.selected, [withPrice]);
    expect(plan.update).toEqual([
      { id: VARIANT_A_ID, printId: PRINT_A_ID, patch: { images: [makeImage("a2"), makeImage("a1")], priceOverride: null } },
    ]);
  });

  it("deseleccionar una variante activa la retira", () => {
    const state = removePrint(stateFromBaseline(baseline([existingA])), PRINT_A_ID);
    const plan = planVariantChanges(state.selected, [existingA]);
    expect(plan.retire.map((v) => v.id)).toEqual([VARIANT_A_ID]);
  });

  it("volver a elegir una variante retirada la reactiva", () => {
    const state = addPrint(emptyFormState(), PRINT_B_ID, [existingB]);
    const plan = planVariantChanges(state.selected, [existingB]);
    expect(plan.update).toEqual([{ id: VARIANT_B_ID, printId: PRINT_B_ID, patch: { isActive: true } }]);
    expect(plan.create).toEqual([]);
  });

  it("una variante ya retirada que sigue sin elegir no hace nada", () => {
    expect(planVariantChanges([], [existingB])).toEqual({ create: [], update: [], retire: [] });
  });
});

describe("isDirty", () => {
  it("crear: vacío no está sucio; escribir algo sí", () => {
    expect(isDirty(emptyFormState(), null)).toBe(false);
    expect(isDirty({ ...emptyFormState(), model: { ...VALID } }, null)).toBe(true);
    expect(isDirty(addPrint(emptyFormState(), PRINT_A_ID, []), null)).toBe(true);
  });

  it("editar: sin cambios no está sucio; cambiar un campo, una estampa o una foto sí", () => {
    const base = baseline([existingA]);
    const state = stateFromBaseline(base);
    expect(isDirty(state, base)).toBe(false);
    expect(isDirty({ ...state, model: { ...state.model, name: "Otro" } }, base)).toBe(true);
    expect(isDirty(removePrint(state, PRINT_A_ID), base)).toBe(true);
    expect(isDirty(setDraftImages(state, PRINT_A_ID, []), base)).toBe(true);
  });
});
