import { PRODUCT_CARD_TAGS_MAX, PRODUCT_CARD_TAG_MAX_LENGTH, type CategoryColor } from "@gira/shared";
import { Field } from "@/components/ui/Field";
import { SelectField } from "@/components/ui/SelectField";
import { Toggle } from "@/components/ui/Toggle";
import { T_LABEL } from "@/components/ui/typography";
import { cn } from "@/lib/cn";
import type { ModelErrors, ModelFields } from "@/lib/catalog/productForm";
import type { PickerPrint } from "@/lib/catalog/catalogOptions";
import { CATEGORY_COLOR_LABEL, CATEGORY_TONE } from "@/lib/store/categoryColors";
import { EditorSection } from "./EditorSection";

interface StoreCardSectionProps {
  model: ModelFields;
  errors: ModelErrors;
  /** Prints chosen for the model: only these can be the card's. */
  selectedPrints: PickerPrint[];
  categoryName: string | undefined;
  categoryColor: CategoryColor | undefined;
  onChange: (patch: Partial<ModelFields>) => void;
}

const AUTOMATIC = "";

/**
 * How the model shows in the storefront: the «Más vendido» and «Novedad» flags, its sale price, the words
 * printed on its card and which print's photos it shows. Its colour is not set
 * here: it is the category's, and this only says which one it will be.
 */
const StoreCardSection = ({ model, errors, selectedPrints, categoryName, categoryColor, onChange }: StoreCardSectionProps) => {
  const printOptions = [
    { value: AUTOMATIC, label: "Automática (primera con fotos)" },
    ...selectedPrints.map((print) => ({ value: print.id, label: print.name })),
  ];

  return (
    <EditorSection title="Tienda" hint="Cómo se ve este modelo en la home de la tienda.">
      <Toggle
        checked={model.bestSeller}
        onChange={(bestSeller) => onChange({ bestSeller })}
        label="Más vendido: aparece en la sección «Más vendidos»"
      />
      <Toggle
        checked={model.newArrival}
        onChange={(newArrival) => onChange({ newArrival })}
        label="Novedad: aparece en la sección «Novedades» (las 5 más recientes)"
      />

      <Field
        label="Precio de rebaja (opcional)"
        inputMode="decimal"
        placeholder="159.00"
        helper="Déjalo vacío para cobrar el precio base. Las estampas con precio especial no se rebajan."
        value={model.salePrice}
        error={errors.salePrice}
        className="font-mono"
        onChange={(event) => onChange({ salePrice: event.target.value })}
      />

      <div className="flex flex-col gap-2">
        <p className={cn(T_LABEL, "text-text-secondary")}>Palabras de la card</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: PRODUCT_CARD_TAGS_MAX }, (_, index) => (
            <Field
              key={index}
              label={`Palabra ${index + 1}`}
              value={model.cardTags[index] ?? ""}
              maxLength={PRODUCT_CARD_TAG_MAX_LENGTH + 10}
              error={index === 0 ? errors.cardTags : undefined}
              placeholder={["Fresca", "Suave", "Ligera"][index] ?? ""}
              onChange={(event) =>
                onChange({ cardTags: model.cardTags.map((tag, i) => (i === index ? event.target.value : tag)) })
              }
            />
          ))}
        </div>
        <p className="text-xs text-text-secondary">Se muestran en mayúsculas, hasta {PRODUCT_CARD_TAG_MAX_LENGTH} caracteres cada una. Opcionales.</p>
      </div>

      <SelectField
        label="Variante de la card"
        options={printOptions}
        value={model.cardPrintId}
        onChange={(cardPrintId) => onChange({ cardPrintId })}
        disabled={selectedPrints.length === 0}
        helper={
          selectedPrints.length === 0
            ? "Elige primero las estampas del modelo."
            : "Su primera foto es la principal y la segunda sale al pasar el cursor."
        }
      />

      {categoryColor ? (
        <p className="flex items-center gap-2 text-sm text-text-secondary">
          <span aria-hidden className={cn("inline-block size-4 rounded-full border-2 border-ink", CATEGORY_TONE[categoryColor].strong)} />
          Color de la card: {CATEGORY_COLOR_LABEL[categoryColor]}, el de la categoría{categoryName ? ` «${categoryName}»` : ""}.
        </p>
      ) : null}
    </EditorSection>
  );
};

export type { StoreCardSectionProps };
export { StoreCardSection };
