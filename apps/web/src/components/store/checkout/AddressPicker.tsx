import type { SavedAddress, Wire } from "@gira/shared";
import { AddressFields } from "@/components/store/account/addresses/AddressFields";
import type { AddressFormErrors, AddressFormValues } from "@/lib/account/addressValidation";
import { cn } from "@/lib/cn";
import { NEW_ADDRESS } from "@/hooks/useAddressChoice";

interface AddressPickerProps {
  addresses: Wire<SavedAddress>[];
  choice: string;
  values: AddressFormValues;
  errors: AddressFormErrors;
  onChoice: (choice: string) => void;
  onValue: (key: keyof AddressFormErrors, value: string) => void;
}

const OPTION =
  "flex cursor-pointer items-start gap-3 rounded-nb-sm border-2 border-ink px-3.5 py-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus";
const MARK = "mt-1 size-[18px] shrink-0 rounded-full border-2 border-ink";

const Option = ({ id, selected, onSelect, children }: { id: string; selected: boolean; onSelect: () => void; children: React.ReactNode }) => (
  <label className={cn(OPTION, selected ? "bg-brand-subtle shadow-nb-sm" : "bg-surface")}>
    <input type="radio" name="shipping-address" value={id} checked={selected} onChange={onSelect} className="sr-only" />
    <span aria-hidden="true" className={cn(MARK, selected ? "bg-ink shadow-[inset_0_0_0_3px_var(--color-brand-subtle)]" : "bg-surface")} />
    <span className="min-w-0 flex-1 text-sm">{children}</span>
  </label>
);

/** «Envío a»: the saved addresses (the default preselected) or «Usar otra dirección», whose fields appear below and are not saved. */
const AddressPicker = ({ addresses, choice, values, errors, onChoice, onValue }: AddressPickerProps) => {
  const typing = choice === NEW_ADDRESS;

  return (
    <fieldset className="grid gap-3 border-0 p-0">
      <legend className="sr-only">Dirección de envío</legend>
      {addresses.map((address) => (
        <Option key={address.id} id={address.id} selected={choice === address.id} onSelect={() => onChoice(address.id)}>
          <b>{address.label ?? address.recipient}</b>
          {address.isDefault ? (
            <span className="ml-2 rounded-full border-2 border-ink bg-success-soft px-2 font-mono text-2xs font-bold uppercase tracking-wide">Predeterminada</span>
          ) : null}
          <span className="mt-0.5 block text-text-secondary">
            {`${address.recipient} · ${address.line1}${address.line2 ? `, ${address.line2}` : ""}, ${address.district}, ${address.city}, C.P. ${address.postalCode}`}
          </span>
        </Option>
      ))}
      {addresses.length > 0 ? (
        <Option id={NEW_ADDRESS} selected={typing} onSelect={() => onChoice(NEW_ADDRESS)}>
          <b>Usar otra dirección</b>
        </Option>
      ) : null}
      {typing ? (
        <div className="grid gap-4 pt-2">
          <AddressFields values={values} errors={errors} showLabel={false} onChange={onValue} />
          <p className="font-mono text-2xs text-text-muted">Esta dirección solo se usa en este pedido; no se guarda en tu cuenta.</p>
        </div>
      ) : null}
    </fieldset>
  );
};

export { AddressPicker };
