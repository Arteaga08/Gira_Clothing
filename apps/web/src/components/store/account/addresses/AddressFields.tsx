import { ADDRESS_LABEL_MAX_LENGTH, MEXICAN_STATES } from "@gira/shared";
import { Field } from "@/components/ui/Field";
import { SelectField } from "@/components/ui/SelectField";
import {
  sanitizeAddressPhone,
  sanitizePostalCode,
  type AddressFormErrors,
  type AddressFormValues,
} from "@/lib/account/addressValidation";

interface AddressFieldsProps {
  values: AddressFormValues;
  errors: AddressFormErrors;
  /** The saved-address nickname. The checkout's one-off address has none. */
  showLabel?: boolean;
  onChange: (key: keyof AddressFormErrors, value: string) => void;
}

const STATE_OPTIONS = MEXICAN_STATES.map((state) => ({ value: state.code, label: state.name }));

/**
 * The fields of an address, with no form, buttons or request of their own: «Mis direcciones» saves what
 * they hold, the checkout only uses it for this one order.
 */
const AddressFields = ({ values, errors, showLabel = true, onChange }: AddressFieldsProps) => (
  <>
    {showLabel ? (
      <Field
        label="Nombre de la dirección (opcional)"
        placeholder="Casa"
        maxLength={ADDRESS_LABEL_MAX_LENGTH}
        value={values.label}
        error={errors.label}
        onChange={(e) => onChange("label", e.target.value)}
      />
    ) : null}
    <Field label="Quién recibe" autoComplete="name" value={values.recipient} error={errors.recipient} onChange={(e) => onChange("recipient", e.target.value)} />
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Calle y número" autoComplete="address-line1" value={values.line1} error={errors.line1} onChange={(e) => onChange("line1", e.target.value)} />
      <Field
        label="Interior, referencias (opcional)"
        autoComplete="address-line2"
        value={values.line2}
        error={errors.line2}
        onChange={(e) => onChange("line2", e.target.value)}
      />
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Colonia" value={values.district} error={errors.district} onChange={(e) => onChange("district", e.target.value)} />
      <Field label="Ciudad" autoComplete="address-level2" value={values.city} error={errors.city} onChange={(e) => onChange("city", e.target.value)} />
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <SelectField label="Estado" options={STATE_OPTIONS} value={values.state} error={errors.state} onChange={(value) => onChange("state", value)} />
      <Field
        label="Código postal"
        inputMode="numeric"
        autoComplete="postal-code"
        value={values.postalCode}
        error={errors.postalCode}
        onChange={(e) => onChange("postalCode", sanitizePostalCode(e.target.value))}
      />
    </div>
    <Field
      label="Celular"
      type="tel"
      inputMode="numeric"
      autoComplete="tel-national"
      helper="10 dígitos: la paquetería lo usa para avisarte de la entrega."
      value={values.phone}
      error={errors.phone}
      onChange={(e) => onChange("phone", sanitizeAddressPhone(e.target.value))}
    />
  </>
);

export { AddressFields };
