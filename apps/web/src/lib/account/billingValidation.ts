import {
  CFDI_USE_CODES,
  FISCAL_REGIME_CODES,
  LEGAL_NAME_MAX_LENGTH,
  POSTAL_CODE_PATTERN,
  RFC_PATTERN,
  type BillingInfo,
  type SaveBillingRequest,
  type Wire,
} from "@gira/shared";

/** Client-side checks of the tax-data form. The API validates again; these save the round trip and explain. */

type BillingFormValues = Record<keyof BillingInfo, string>;
type BillingFormErrors = Partial<Record<keyof BillingInfo, string>>;

const RFC_MAX_LENGTH = 13;
const POSTAL_CODE_LENGTH = 5;

const EMPTY_BILLING_VALUES: BillingFormValues = { rfc: "", legalName: "", fiscalRegime: "", cfdiUse: "", postalCode: "" };

/** Uppercase, no spaces, capped: an RFC is typed or pasted in any case. */
const sanitizeRfc = (value: string): string => value.replace(/\s/g, "").toUpperCase().slice(0, RFC_MAX_LENGTH);
const sanitizeFiscalPostalCode = (value: string): string => value.replace(/\D/g, "").slice(0, POSTAL_CODE_LENGTH);

const validateBilling = (values: BillingFormValues): BillingFormErrors => {
  const errors: BillingFormErrors = {};
  if (values.rfc === "") errors.rfc = "Falta el RFC.";
  else if (!RFC_PATTERN.test(values.rfc)) errors.rfc = "El RFC debe tener 12 o 13 caracteres, por ejemplo LOMM910312AB1.";

  const name = values.legalName.trim();
  if (name === "") errors.legalName = "Falta el nombre o razón social tal como aparece en tu constancia.";
  else if (name.length > LEGAL_NAME_MAX_LENGTH) errors.legalName = `No puede pasar de ${String(LEGAL_NAME_MAX_LENGTH)} caracteres.`;
  else if (/[<>]/.test(name)) errors.legalName = "Hay caracteres no permitidos.";

  if (!FISCAL_REGIME_CODES.includes(values.fiscalRegime)) errors.fiscalRegime = "Elige tu régimen fiscal.";
  if (!CFDI_USE_CODES.includes(values.cfdiUse)) errors.cfdiUse = "Elige el uso de CFDI.";
  if (!POSTAL_CODE_PATTERN.test(values.postalCode)) errors.postalCode = "Escribe los 5 dígitos del código postal fiscal.";
  return errors;
};

const billingToValues = (billing: Wire<BillingInfo>): BillingFormValues => ({ ...billing });

const valuesToBillingRequest = (values: BillingFormValues): SaveBillingRequest => ({
  rfc: values.rfc,
  legalName: values.legalName.trim(),
  fiscalRegime: values.fiscalRegime,
  cfdiUse: values.cfdiUse,
  postalCode: values.postalCode,
});

export type { BillingFormValues, BillingFormErrors };
export { EMPTY_BILLING_VALUES, sanitizeRfc, sanitizeFiscalPostalCode, validateBilling, billingToValues, valuesToBillingRequest };
