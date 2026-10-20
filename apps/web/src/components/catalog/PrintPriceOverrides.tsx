import { Field } from "@/components/ui/Field";
import { T_LABEL, T_PANEL_HINT } from "@/components/ui/typography";
import type { PickerPrint } from "@/lib/catalog/catalogOptions";
import type { VariantDraft } from "@/lib/catalog/productForm";
import { ImageTile } from "./ImageTile";

interface PrintPriceOverridesProps {
  drafts: VariantDraft[];
  prints: ReadonlyMap<string, PickerPrint>;
  /** Errors by printId. */
  errors: Record<string, string>;
  /** The model's base price (pesos text), shown as the placeholder: that is what an empty field charges. */
  basePricePlaceholder: string;
  onChange: (printId: string, value: string) => void;
}

/** One optional price per chosen print. Empty means "use the model's base price". Money is mono. */
const PrintPriceOverrides = ({ drafts, prints, errors, basePricePlaceholder, onChange }: PrintPriceOverridesProps) => {
  if (drafts.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className={`${T_LABEL} text-text-secondary`}>Precio especial (opcional)</p>
        <p className={T_PANEL_HINT}>Déjalo vacío para cobrar el precio base.</p>
      </div>
      <ul className="flex flex-col gap-3">
        {drafts.map((draft) => {
          const print = prints.get(draft.printId);
          const name = print?.name ?? "Estampa";
          return (
            <li key={draft.printId} className="flex flex-wrap items-center gap-3">
              <ImageTile url={print?.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded-nb-sm border-2 border-ink" />
              <span className="w-40 min-w-0 truncate text-sm font-bold sm:w-56">{name}</span>
              <Field
                label="Precio especial"
                aria-label={`Precio especial de ${name}`}
                inputMode="decimal"
                placeholder={basePricePlaceholder}
                value={draft.priceOverride}
                error={errors[draft.printId]}
                className="font-mono"
                containerClassName="w-44"
                onChange={(event) => onChange(draft.printId, event.target.value)}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export type { PrintPriceOverridesProps };
export { PrintPriceOverrides };
