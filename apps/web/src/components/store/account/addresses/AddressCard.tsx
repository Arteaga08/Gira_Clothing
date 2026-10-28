import { MEXICAN_STATES, type SavedAddress, type Wire } from "@gira/shared";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

interface AddressCardProps {
  address: Wire<SavedAddress>;
  disabled: boolean;
  onEdit: () => void;
  onMakeDefault: () => void;
  onDelete: () => void;
}

const stateName = (code: string): string => MEXICAN_STATES.find((state) => state.code === code)?.name ?? code;

/** One saved address: label, «Predeterminada» chip, the lines as they print on a label and the three actions. */
const AddressCard = ({ address, disabled, onEdit, onMakeDefault, onDelete }: AddressCardProps) => {
  const title = address.label ?? address.recipient;
  return (
    <li className="grid gap-3 py-5 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-bold">{title}</h3>
        {address.isDefault ? <Badge variant="ok">Predeterminada</Badge> : null}
      </div>
      <address className="grid gap-0.5 text-sm not-italic text-text-secondary">
        {address.label ? <span>{address.recipient}</span> : null}
        <span>{address.line2 ? `${address.line1}, ${address.line2}` : address.line1}</span>
        <span>{`${address.district}, ${address.city}, ${stateName(address.state)}, C.P. ${address.postalCode}`}</span>
        <span className="font-mono">{`Cel. ${address.phone}`}</span>
      </address>
      <div className="flex flex-wrap gap-2">
        <Button variant="edit" size="sm" disabled={disabled} onClick={onEdit} aria-label={`Editar ${title}`}>
          Editar
        </Button>
        {address.isDefault ? null : (
          <Button variant="edit" size="sm" disabled={disabled} onClick={onMakeDefault} aria-label={`Hacer predeterminada ${title}`}>
            Hacer predeterminada
          </Button>
        )}
        <Button variant="danger" size="sm" disabled={disabled} onClick={onDelete} aria-label={`Eliminar ${title}`}>
          Eliminar
        </Button>
      </div>
    </li>
  );
};

export { AddressCard };
