/** The form as the inputs hold it. */
interface TaxonFormValues {
  name: string;
  description: string;
}

/** What the server held when the modal opened: the reference an edit is diffed against. */
interface TaxonBaseline {
  name: string;
  description: string;
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
}

interface UpdateTaxonBody {
  name?: string;
  description?: string;
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
  return { name: values.name.trim(), ...(description ? { description } : {}) };
};

/** Only what changed. Clearing the description sends `""`, which the API accepts. */
const toUpdateBody = (values: TaxonFormValues, baseline: TaxonBaseline): UpdateTaxonBody => {
  const body: UpdateTaxonBody = {};
  const name = values.name.trim();
  const description = values.description.trim();
  if (name !== baseline.name) body.name = name;
  if (description !== baseline.description.trim()) body.description = description;
  return body;
};

export { validateTaxonForm, toCreateBody, toUpdateBody };
export type { TaxonFormValues, TaxonBaseline, TaxonLimits, TaxonFormErrors, CreateTaxonBody, UpdateTaxonBody };
