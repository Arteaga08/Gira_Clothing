import {
  PRODUCT_BASE_PRICE_MAX,
  PRODUCT_CARD_TAGS_MAX,
  PRODUCT_CARD_TAG_MAX_LENGTH,
  PRODUCT_DESCRIPTION_MAX,
  PRODUCT_MATERIAL_MAX,
  PRODUCT_MATERIALS_MAX,
  PRODUCT_MEASURE_MAX,
  PRODUCT_NAME_MAX,
  PRODUCT_NAME_MIN,
  PRODUCT_WEIGHT_MAX,
  PRODUCT_WEIGHT_MIN,
  VARIANT_PRICE_OVERRIDE_MAX,
} from "@gira/shared";
import type { ImageAttrs, Measurements } from "@gira/shared";
import type { EditorProduct, ExistingVariant } from "./editorProduct";
import { centsToPesosText, parsePesos } from "./money";

/** Text exactly as the inputs hold it: validation and conversion happen on save, never while typing. */
interface ModelFields {
  name: string;
  categoryId: string;
  description: string;
  /** Pesos, e.g. "189.00". */
  price: string;
  /** Grams. */
  weight: string;
  width: string;
  height: string;
  depth: string;
  /** Comma-separated. */
  materials: string;
  /** «Más vendido»: shows in the storefront section of that name. */
  bestSeller: boolean;
  /** «Novedad»: shows in the storefront section «Novedades». */
  newArrival: boolean;
  /** The words of the storefront card: always PRODUCT_CARD_TAGS_MAX inputs, empty ones are dropped on save. */
  cardTags: string[];
  /** Print whose variant the card shows; "" follows the first variant with photos. */
  cardPrintId: string;
}

/** One print chosen for the model. `priceOverride` is pesos text; empty means "use the base price". */
interface VariantDraft {
  printId: string;
  priceOverride: string;
  images: ImageAttrs[];
}

interface ProductFormState {
  model: ModelFields;
  sizeImage: ImageAttrs | null;
  selected: VariantDraft[];
}

/** What the server held when the editor loaded: the reference every diff is taken against. */
interface ProductBaseline {
  product: EditorProduct;
  variants: ExistingVariant[];
}

type ModelErrors = Partial<Record<keyof ModelFields, string>>;

interface ModelBody {
  name: string;
  category: string;
  description: string;
  /** MXN centavos. */
  basePrice: number;
  weightGrams: number;
  measurements: Measurements;
  materials: string[];
  bestSeller: boolean;
  newArrival: boolean;
  cardTags: string[];
  /** `null` returns the card to the automatic variant. */
  cardPrint: string | null;
}

type CreateProductBody = ModelBody & { sizeImage?: ImageAttrs };
type UpdateProductBody = Partial<ModelBody> & { sizeImage?: ImageAttrs | null };

interface VariantPatch {
  images?: ImageAttrs[];
  /** `null` removes the override. */
  priceOverride?: number | null;
  isActive?: boolean;
}

interface VariantCreate {
  printId: string;
  priceOverride?: number;
  images: ImageAttrs[];
}

interface VariantPlan {
  create: VariantCreate[];
  update: { id: string; printId: string; patch: VariantPatch }[];
  retire: ExistingVariant[];
}

const EMPTY_MODEL: ModelFields = {
  name: "",
  categoryId: "",
  description: "",
  price: "",
  weight: "",
  width: "",
  height: "",
  depth: "",
  materials: "",
  bestSeller: false,
  newArrival: false,
  cardTags: Array.from({ length: PRODUCT_CARD_TAGS_MAX }, () => ""),
  cardPrintId: "",
};

const emptyFormState = (): ProductFormState => ({ model: { ...EMPTY_MODEL }, sizeImage: null, selected: [] });

const measureText = (value: number | undefined): string => (value === undefined ? "" : String(value));

const draftFromExisting = (variant: ExistingVariant): VariantDraft => ({
  printId: variant.printId,
  priceOverride: variant.priceOverride === undefined ? "" : centsToPesosText(variant.priceOverride),
  images: variant.images,
});

const stateFromBaseline = ({ product, variants }: ProductBaseline): ProductFormState => ({
  model: {
    name: product.name,
    categoryId: product.categoryId,
    description: product.description,
    price: centsToPesosText(product.basePrice),
    weight: String(product.weightGrams),
    width: measureText(product.measurements.widthCm),
    height: measureText(product.measurements.heightCm),
    depth: measureText(product.measurements.depthCm),
    materials: product.materials.join(", "),
    bestSeller: product.bestSeller,
    newArrival: product.newArrival,
    cardTags: Array.from({ length: PRODUCT_CARD_TAGS_MAX }, (_, index) => product.cardTags[index] ?? ""),
    cardPrintId: product.cardPrintId,
  },
  sizeImage: product.sizeImage ?? null,
  selected: variants.filter((variant) => variant.isActive).map(draftFromExisting),
});

const MEASURE_PATTERN = /^\d+(\.\d+)?$/;
const WEIGHT_PATTERN = /^\d+$/;

const parseMaterials = (text: string): string[] =>
  text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const measureError = (text: string): string | undefined => {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const valid = MEASURE_PATTERN.test(trimmed) && Number(trimmed) <= PRODUCT_MEASURE_MAX;
  return valid ? undefined : `Escribe una medida entre 0 y ${PRODUCT_MEASURE_MAX} cm.`;
};

const validateModel = (model: ModelFields): ModelErrors => {
  const errors: ModelErrors = {};

  const name = model.name.trim();
  if (name.length < PRODUCT_NAME_MIN) errors.name = `El nombre debe tener al menos ${PRODUCT_NAME_MIN} caracteres.`;
  else if (name.length > PRODUCT_NAME_MAX) errors.name = `El nombre no puede exceder ${PRODUCT_NAME_MAX} caracteres.`;

  if (!model.categoryId) errors.categoryId = "Elige una categoría.";

  const price = parsePesos(model.price);
  if (price === null) errors.price = "Escribe el precio en pesos, por ejemplo 189.00.";
  else if (price > PRODUCT_BASE_PRICE_MAX) {
    errors.price = `El precio no puede pasar de $${centsToPesosText(PRODUCT_BASE_PRICE_MAX)}.`;
  }

  const weight = model.weight.trim();
  if (!weight) errors.weight = "Indica el peso en gramos para cotizar el envío.";
  else if (!WEIGHT_PATTERN.test(weight) || Number(weight) < PRODUCT_WEIGHT_MIN || Number(weight) > PRODUCT_WEIGHT_MAX) {
    errors.weight = `El peso debe ser un entero entre ${PRODUCT_WEIGHT_MIN} y ${PRODUCT_WEIGHT_MAX} g.`;
  }

  const width = measureError(model.width);
  const height = measureError(model.height);
  const depth = measureError(model.depth);
  if (width) errors.width = width;
  if (height) errors.height = height;
  if (depth) errors.depth = depth;

  if (model.description.trim().length > PRODUCT_DESCRIPTION_MAX) {
    errors.description = `La descripción no puede exceder ${PRODUCT_DESCRIPTION_MAX} caracteres.`;
  }

  const materials = parseMaterials(model.materials);
  if (materials.length > PRODUCT_MATERIALS_MAX) {
    errors.materials = `No puedes registrar más de ${PRODUCT_MATERIALS_MAX} materiales.`;
  } else if (materials.some((material) => material.length > PRODUCT_MATERIAL_MAX)) {
    errors.materials = `Cada material puede tener hasta ${PRODUCT_MATERIAL_MAX} caracteres.`;
  }

  if (model.cardTags.some((tag) => tag.trim().length > PRODUCT_CARD_TAG_MAX_LENGTH)) {
    errors.cardTags = `Cada palabra puede tener hasta ${PRODUCT_CARD_TAG_MAX_LENGTH} caracteres.`;
  }

  return errors;
};

/** Errors by printId. An empty override is valid: the variant simply uses the base price. */
const validateVariantPrices = (selected: readonly VariantDraft[]): Record<string, string> => {
  const errors: Record<string, string> = {};
  for (const draft of selected) {
    const text = draft.priceOverride.trim();
    if (!text) continue;
    const cents = parsePesos(text);
    if (cents === null) errors[draft.printId] = "Escribe el precio en pesos, por ejemplo 209.00.";
    else if (cents > VARIANT_PRICE_OVERRIDE_MAX) {
      errors[draft.printId] = `El precio no puede pasar de $${centsToPesosText(VARIANT_PRICE_OVERRIDE_MAX)}.`;
    }
  }
  return errors;
};

/** Assumes `validateModel` passed: `parsePesos`/`Number` cannot fail on what it accepted. */
const toModelBody = (model: ModelFields): ModelBody => {
  const measurements: Measurements = {};
  if (model.width.trim()) measurements.widthCm = Number(model.width);
  if (model.height.trim()) measurements.heightCm = Number(model.height);
  if (model.depth.trim()) measurements.depthCm = Number(model.depth);
  return {
    name: model.name.trim(),
    category: model.categoryId,
    description: model.description.trim(),
    basePrice: parsePesos(model.price) ?? 0,
    weightGrams: Number(model.weight),
    measurements,
    materials: parseMaterials(model.materials),
    bestSeller: model.bestSeller,
    newArrival: model.newArrival,
    cardTags: model.cardTags.map((tag) => tag.trim()).filter(Boolean),
    cardPrint: model.cardPrintId || null,
  };
};

const toCreateBody = (state: ProductFormState): CreateProductBody => ({
  ...toModelBody(state.model),
  ...(state.sizeImage ? { sizeImage: state.sizeImage } : {}),
});

/** Only what changed, or `null` when nothing did (no request, no `updatedAt` bump). */
const toUpdateBody = (state: ProductFormState, baseline: ProductBaseline): UpdateProductBody | null => {
  const next = toModelBody(state.model);
  const previous = toModelBody(stateFromBaseline(baseline).model);
  const body: UpdateProductBody = {};
  for (const key of Object.keys(next) as (keyof ModelBody)[]) {
    if (JSON.stringify(next[key]) !== JSON.stringify(previous[key])) {
      (body as Record<string, unknown>)[key] = next[key];
    }
  }
  const before = baseline.product.sizeImage?.publicId;
  const after = state.sizeImage?.publicId;
  if (before !== after) body.sizeImage = state.sizeImage ?? null;
  return Object.keys(body).length > 0 ? body : null;
};

/** Picks a print for the model. A print whose variant was retired comes back with its old price and photos. */
const addPrint = (state: ProductFormState, printId: string, existing: readonly ExistingVariant[]): ProductFormState => {
  if (state.selected.some((draft) => draft.printId === printId)) return state;
  const previous = existing.find((variant) => variant.printId === printId);
  const draft: VariantDraft = previous ? draftFromExisting(previous) : { printId, priceOverride: "", images: [] };
  return { ...state, selected: [...state.selected, draft] };
};

/** A print that leaves the selection can no longer be the card's: the card goes back to automatic. */
const removePrint = (state: ProductFormState, printId: string): ProductFormState => ({
  ...state,
  model: state.model.cardPrintId === printId ? { ...state.model, cardPrintId: "" } : state.model,
  selected: state.selected.filter((draft) => draft.printId !== printId),
});

const updateDraft = (state: ProductFormState, printId: string, patch: Partial<VariantDraft>): ProductFormState => ({
  ...state,
  selected: state.selected.map((draft) => (draft.printId === printId ? { ...draft, ...patch } : draft)),
});

const setDraftPrice = (state: ProductFormState, printId: string, priceOverride: string): ProductFormState =>
  updateDraft(state, printId, { priceOverride });

const setDraftImages = (state: ProductFormState, printId: string, images: ImageAttrs[]): ProductFormState =>
  updateDraft(state, printId, { images });

/** Adds freshly uploaded photos to the END of a draft's list, against the latest state (an upload outlives several renders). */
const appendDraftImages = (state: ProductFormState, printId: string, added: ImageAttrs[]): ProductFormState => ({
  ...state,
  selected: state.selected.map((draft) =>
    draft.printId === printId ? { ...draft, images: [...draft.images, ...added] } : draft,
  ),
});

const sameImages = (a: readonly ImageAttrs[], b: readonly ImageAttrs[]): boolean =>
  a.length === b.length && a.every((image, index) => image.publicId === b[index]?.publicId);

const overrideOf = (draft: VariantDraft): number | undefined => {
  if (!draft.priceOverride.trim()) return undefined;
  return parsePesos(draft.priceOverride) ?? undefined;
};

/** What has to happen on the server so its variants match the selection. */
const planVariantChanges = (selected: readonly VariantDraft[], existing: readonly ExistingVariant[]): VariantPlan => {
  const byPrint = new Map(existing.map((variant) => [variant.printId, variant]));
  const plan: VariantPlan = { create: [], update: [], retire: [] };

  for (const draft of selected) {
    const price = overrideOf(draft);
    const current = byPrint.get(draft.printId);
    if (!current) {
      plan.create.push({
        printId: draft.printId,
        ...(price !== undefined ? { priceOverride: price } : {}),
        images: draft.images,
      });
      continue;
    }
    const patch: VariantPatch = {};
    if (!current.isActive) patch.isActive = true;
    if (!sameImages(current.images, draft.images)) patch.images = draft.images;
    if (price !== current.priceOverride) patch.priceOverride = price ?? null;
    if (Object.keys(patch).length > 0) plan.update.push({ id: current.id, printId: draft.printId, patch });
  }

  const chosen = new Set(selected.map((draft) => draft.printId));
  plan.retire = existing.filter((variant) => variant.isActive && !chosen.has(variant.printId));
  return plan;
};

const planIsEmpty = (plan: VariantPlan): boolean =>
  plan.create.length === 0 && plan.update.length === 0 && plan.retire.length === 0;

/** True when saving would do something. `baseline === null` is the create form. */
const isDirty = (state: ProductFormState, baseline: ProductBaseline | null): boolean => {
  if (!baseline) return JSON.stringify(state) !== JSON.stringify(emptyFormState());
  return toUpdateBody(state, baseline) !== null || !planIsEmpty(planVariantChanges(state.selected, baseline.variants));
};

export {
  EMPTY_MODEL,
  emptyFormState,
  stateFromBaseline,
  validateModel,
  validateVariantPrices,
  toCreateBody,
  toUpdateBody,
  addPrint,
  removePrint,
  setDraftPrice,
  setDraftImages,
  appendDraftImages,
  planVariantChanges,
  isDirty,
};
export type {
  ModelFields,
  ModelErrors,
  VariantDraft,
  ProductFormState,
  ProductBaseline,
  CreateProductBody,
  UpdateProductBody,
  VariantPatch,
  VariantCreate,
  VariantPlan,
};
