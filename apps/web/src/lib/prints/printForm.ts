import {
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
}

/** What the server held when the panel opened: the reference an edit is diffed against. */
interface PrintBaseline {
  name: string;
  familyId: string;
  imageUrl: string;
}

type PrintFormErrors = Partial<Record<"name" | "sku" | "family" | "image", string | undefined>>;

interface CreatePrintBody {
  name: string;
  sku: string;
  family: string;
  image: ImageAttrs;
}

/** The SKU is never part of an update: every variant SKU was built from it. */
interface UpdatePrintBody {
  name?: string;
  family?: string;
  image?: ImageAttrs;
}

const NAME_ERROR = `El nombre debe tener entre ${PRINT_NAME_MIN} y ${PRINT_NAME_MAX} caracteres.`;
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
  return errors;
};

/** Call only after `validatePrintForm` passed: the image is guaranteed there. */
const toCreateBody = (values: PrintFormValues): CreatePrintBody => ({
  name: values.name.trim(),
  sku: values.sku.trim().toUpperCase(),
  family: values.familyId,
  image: values.image as ImageAttrs,
});

const toUpdateBody = (values: PrintFormValues, baseline: PrintBaseline): UpdatePrintBody => {
  const body: UpdatePrintBody = {};
  const name = values.name.trim();
  if (name !== baseline.name) body.name = name;
  if (values.familyId !== baseline.familyId) body.family = values.familyId;
  if (values.image && values.image.url !== baseline.imageUrl) body.image = values.image;
  return body;
};

export { validatePrintForm, toCreateBody, toUpdateBody };
export type { PrintFormValues, PrintBaseline, PrintFormErrors, CreatePrintBody, UpdatePrintBody };
