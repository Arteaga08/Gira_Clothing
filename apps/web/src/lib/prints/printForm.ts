import {
  PRINT_HOME_BLURB_MAX,
  PRINT_HOME_POSITION_MAX,
  PRINT_NAME_MAX,
  PRINT_NAME_MIN,
  PRINT_SKU_MAX,
  PRINT_SKU_MIN,
  PRINT_SKU_PATTERN,
} from "@gira/shared";
import type { ImageAttrs } from "@gira/shared";

/** The form as the inputs hold it. */
interface PrintFormValues {
  name: string;
  sku: string;
  familyId: string;
  image: ImageAttrs | null;
  /** "" = not in the home; otherwise "1".."5", as the select holds it. */
  homePosition: string;
  /** Line under the name in the home; "" = the family description stands in. */
  homeBlurb: string;
}

/** What the server held when the panel opened: the reference an edit is diffed against. */
interface PrintBaseline {
  name: string;
  familyId: string;
  imageUrl: string;
  homePosition: number | null;
  homeBlurb: string;
}

type PrintFormErrors = Partial<Record<"name" | "sku" | "family" | "image" | "homeBlurb", string | undefined>>;

interface CreatePrintBody {
  name: string;
  sku: string;
  family: string;
  image: ImageAttrs;
  homePosition?: number;
  homeBlurb?: string;
}

/** The SKU is never part of an update: every variant SKU was built from it. */
interface UpdatePrintBody {
  name?: string;
  family?: string;
  image?: ImageAttrs;
  /** null takes the print out of the home. */
  homePosition?: number | null;
  /** "" clears it. */
  homeBlurb?: string;
}

const NAME_ERROR = `El nombre debe tener entre ${PRINT_NAME_MIN} y ${PRINT_NAME_MAX} caracteres.`;
const BLURB_ERROR = `El texto de la home no puede exceder ${PRINT_HOME_BLURB_MAX} caracteres.`;
const SKU_ERROR = `El SKU debe tener de ${PRINT_SKU_MIN} a ${PRINT_SKU_MAX} caracteres: letras, números y guiones.`;

const validatePrintForm = (values: PrintFormValues, mode: "create" | "edit"): PrintFormErrors => {
  const errors: PrintFormErrors = {};
  const name = values.name.trim();
  if (name.length < PRINT_NAME_MIN || name.length > PRINT_NAME_MAX) errors.name = NAME_ERROR;
  const sku = values.sku.trim().toUpperCase();
  if (mode === "create" && (sku.length < PRINT_SKU_MIN || sku.length > PRINT_SKU_MAX || !PRINT_SKU_PATTERN.test(sku))) {
    errors.sku = SKU_ERROR;
  }
  if (!values.familyId) errors.family = "Elige una familia.";
  // An existing print already has its image; only a new one must bring it.
  if (mode === "create" && !values.image) errors.image = "Sube la imagen de la estampa.";
  if (values.homeBlurb.trim().length > PRINT_HOME_BLURB_MAX) errors.homeBlurb = BLURB_ERROR;
  return errors;
};

/** Options of the «Posición en la home» select: none, then 1..max. */
const HOME_POSITION_OPTIONS = [
  { value: "", label: "No aparece en la home" },
  ...Array.from({ length: PRINT_HOME_POSITION_MAX }, (_, slot) => ({
    value: String(slot + 1),
    label: `Posición ${slot + 1}`,
  })),
];

const toHomePosition = (value: string): number | null => (value === "" ? null : Number(value));

/** Call only after `validatePrintForm` passed: the image is guaranteed there. */
const toCreateBody = (values: PrintFormValues): CreatePrintBody => {
  const homePosition = toHomePosition(values.homePosition);
  const homeBlurb = values.homeBlurb.trim();
  return {
    name: values.name.trim(),
    sku: values.sku.trim().toUpperCase(),
    family: values.familyId,
    image: values.image as ImageAttrs,
    ...(homePosition !== null ? { homePosition } : {}),
    ...(homeBlurb ? { homeBlurb } : {}),
  };
};

/** The reference an edit is diffed against, from the print the panel holds. */
const baselineFromPrint = (print: {
  name: string;
  family: { id: string };
  imageUrl: string;
  homePosition: number | null;
  homeBlurb: string;
}): PrintBaseline => ({
  name: print.name,
  familyId: print.family.id,
  imageUrl: print.imageUrl,
  homePosition: print.homePosition,
  homeBlurb: print.homeBlurb,
});

const toUpdateBody = (values: PrintFormValues, baseline: PrintBaseline): UpdatePrintBody => {
  const body: UpdatePrintBody = {};
  const name = values.name.trim();
  if (name !== baseline.name) body.name = name;
  if (values.familyId !== baseline.familyId) body.family = values.familyId;
  if (values.image && values.image.url !== baseline.imageUrl) body.image = values.image;
  const homePosition = toHomePosition(values.homePosition);
  if (homePosition !== baseline.homePosition) body.homePosition = homePosition;
  const homeBlurb = values.homeBlurb.trim();
  if (homeBlurb !== baseline.homeBlurb) body.homeBlurb = homeBlurb;
  return body;
};

export { validatePrintForm, toCreateBody, toUpdateBody, baselineFromPrint, HOME_POSITION_OPTIONS };
export type { PrintFormValues, PrintBaseline, PrintFormErrors, CreatePrintBody, UpdatePrintBody };
