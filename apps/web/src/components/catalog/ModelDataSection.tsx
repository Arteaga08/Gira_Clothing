"use client";

import { useId } from "react";
import { Field } from "@/components/ui/Field";
import { SelectField } from "@/components/ui/SelectField";
import { T_LABEL } from "@/components/ui/typography";
import { cn } from "@/lib/cn";
import type { Option } from "@/lib/catalog/catalogOptions";
import type { ModelErrors, ModelFields } from "@/lib/catalog/productForm";
import { EditorSection } from "./EditorSection";
import { SizePhotoField, type SizePhotoFieldProps } from "./SizePhotoField";

interface ModelDataSectionProps {
  model: ModelFields;
  errors: ModelErrors;
  categories: Option[];
  onChange: (patch: Partial<ModelFields>) => void;
  sizePhoto: SizePhotoFieldProps;
}

interface DescriptionFieldProps {
  value: string;
  error?: string | undefined;
  onChange: (value: string) => void;
}

/** There is no shared textarea in the kit: this one mirrors Field's label/error wiring and surface. */
const DescriptionField = ({ value, error, onChange }: DescriptionFieldProps) => {
  const id = useId();
  const messageId = useId();
  return (
    <div className="flex flex-col gap-1.5 sm:col-span-2">
      <label htmlFor={id} className={`${T_LABEL} text-text-secondary`}>
        Descripción
      </label>
      <textarea
        id={id}
        rows={3}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...(error ? { "aria-invalid": true, "aria-describedby": messageId } : {})}
        className={cn(
          "rounded-nb-sm border-2 bg-surface p-3 text-sm text-text-primary shadow-nb-sm",
          error ? "border-danger" : "border-ink",
        )}
      />
      {error ? (
        <p id={messageId} className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
};

/**
 * The model's own data: name, category, base price, weight, description,
 * measurements, materials and the size photo. Everything is text until save;
 * money is typed in pesos and shown in mono.
 */
const ModelDataSection = ({ model, errors, categories, onChange, sizePhoto }: ModelDataSectionProps) => (
  <EditorSection title="Datos del modelo">
    <div className="grid gap-4 sm:grid-cols-2">
      <Field
        label="Nombre"
        value={model.name}
        error={errors.name}
        onChange={(event) => onChange({ name: event.target.value })}
      />
      <SelectField
        label="Categoría"
        options={[{ value: "", label: "Elige una categoría" }, ...categories]}
        value={model.categoryId}
        error={errors.categoryId}
        onChange={(event) => onChange({ categoryId: event.target.value })}
      />
      <Field
        label="Precio base (MXN)"
        inputMode="decimal"
        placeholder="189.00"
        helper="Se cobra este precio salvo que una estampa tenga precio especial."
        value={model.price}
        error={errors.price}
        className="font-mono"
        onChange={(event) => onChange({ price: event.target.value })}
      />
      <Field
        label="Peso (g)"
        inputMode="numeric"
        placeholder="140"
        helper="Peso de una pieza empacada: cotiza el envío."
        value={model.weight}
        error={errors.weight}
        className="font-mono"
        onChange={(event) => onChange({ weight: event.target.value })}
      />
      <DescriptionField
        value={model.description}
        error={errors.description}
        onChange={(description) => onChange({ description })}
      />
      <div className="grid grid-cols-3 gap-3 sm:col-span-2">
        <Field
          label="Ancho (cm)"
          inputMode="decimal"
          value={model.width}
          error={errors.width}
          className="font-mono"
          onChange={(event) => onChange({ width: event.target.value })}
        />
        <Field
          label="Alto (cm)"
          inputMode="decimal"
          value={model.height}
          error={errors.height}
          className="font-mono"
          onChange={(event) => onChange({ height: event.target.value })}
        />
        <Field
          label="Profundidad (cm)"
          inputMode="decimal"
          value={model.depth}
          error={errors.depth}
          className="font-mono"
          onChange={(event) => onChange({ depth: event.target.value })}
        />
      </div>
      <Field
        label="Materiales"
        helper="Sepáralos con comas. Máximo 10."
        value={model.materials}
        error={errors.materials}
        containerClassName="sm:col-span-2"
        onChange={(event) => onChange({ materials: event.target.value })}
      />
      <SizePhotoField {...sizePhoto} />
    </div>
  </EditorSection>
);

export type { ModelDataSectionProps };
export { ModelDataSection };
