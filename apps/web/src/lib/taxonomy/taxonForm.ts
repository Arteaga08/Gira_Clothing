import type { CategoryColor, ImageAttrs } from "@gira/shared";

/** The form as the inputs hold it. `color` is null for families: they have none. */
interface TaxonFormValues {
  name: string;
  description: string;
  color: CategoryColor | null;
  /** Categories only: a photo uploaded in this session; null / absent keeps the one saved. */
  image?: ImageAttrs | null;
}

/** What the server held when the modal opened: the reference an edit is diffed against. */
interface TaxonBaseline {
  name: string;
  description: string;
  color: CategoryColor | null;
}

interface TaxonLimits {
  nameMin: number;
  nameMax: number;
  descriptionMax: number;
}

type TaxonFormErrors = Partial<Record<"name" | "description", string | undefined>>;

interface CreateTaxonBody {
  name: string;
  description?: string;
  color?: CategoryColor;
  image?: ImageAttrs;
}

interface UpdateTaxonBody {
  name?: string;
  description?: string;
  color?: CategoryColor;
  image?: ImageAttrs;
}

const validateTaxonForm = (values: TaxonFormValues, limits: TaxonLimits): TaxonFormErrors => {
  const errors: TaxonFormErrors = {};
  const name = values.name.trim();
  if (name.length < limits.nameMin || name.length > limits.nameMax) {
    errors.name = `El nombre debe tener entre ${limits.nameMin} y ${limits.nameMax} caracteres.`;
  }
  if (values.description.trim().length > limits.descriptionMax) {
    errors.description = `La descripción no puede exceder ${limits.descriptionMax} caracteres.`;
  }
  return errors;
};

/** Call only after `validateTaxonForm` passed. An empty description is simply not sent. */
const toCreateBody = (values: TaxonFormValues): CreateTaxonBody => {
  const description = values.description.trim();
  return { name: values.name.trim(), ...(description ? { description } : {}), ...(values.color ? { color: values.color } : {}), ...(values.image ? { image: values.image } : {}) };
};

/** Only what changed. Clearing the description sends `""`, which the API accepts. */
const toUpdateBody = (values: TaxonFormValues, baseline: TaxonBaseline): UpdateTaxonBody => {
  const body: UpdateTaxonBody = {};
  const name = values.name.trim();
  const description = values.description.trim();
  if (name !== baseline.name) body.name = name;
  if (description !== baseline.description.trim()) body.description = description;
  if (values.color && values.color !== baseline.color) body.color = values.color;
  if (values.image) body.image = values.image;
  return body;
};

export { validateTaxonForm, toCreateBody, toUpdateBody };
export type { TaxonFormValues, TaxonBaseline, TaxonLimits, TaxonFormErrors, CreateTaxonBody, UpdateTaxonBody };
