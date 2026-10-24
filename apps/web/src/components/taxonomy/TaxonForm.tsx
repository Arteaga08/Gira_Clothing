"use client";

import { useId, useState, type FormEvent } from "react";
import { ImageTile } from "@/components/catalog/ImageTile";
import { UploadTile } from "@/components/catalog/UploadTile";
import { CategoryColorField } from "@/components/ui/CategoryColorField";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { T_LABEL } from "@/components/ui/typography";
import type { UseImageUpload } from "@/hooks/useImageUpload";
import { cn } from "@/lib/cn";
import type { TaxonConfig } from "@/lib/taxonomy/config";
import type { TaxonFormErrors, TaxonFormValues } from "@/lib/taxonomy/taxonForm";

interface TaxonFormProps {
  /** The footer's submit button points here with its `form` attribute. */
  formId: string;
  config: TaxonConfig;
  mode: "create" | "edit";
  values: TaxonFormValues;
  /** Photo already saved (categories). */
  savedImageUrl?: string | undefined;
  upload: UseImageUpload["upload"];
  uploading: boolean;
  errors: TaxonFormErrors;
  /** The API's own message (Spanish) or the generic one. */
  error: string | null;
  onChange: (values: TaxonFormValues) => void;
  onSubmit: () => void;
}

/**
 * The record's two fields. Controlled: the modal owns the values because the
 * submit button lives in its pinned footer, outside this form.
 */
const TaxonForm = ({ formId, config, mode, values, savedImageUrl, upload, uploading, errors, error, onChange, onSubmit }: TaxonFormProps) => {
  const descriptionId = useId();
  const imageErrorId = useId();
  const [imageError, setImageError] = useState<string | null>(null);
  const previewUrl = values.image?.url ?? savedImageUrl;
  const pickImage = async (file: File) => {
    const outcome = await upload(file, "categories");
    if (!outcome.ok) {
      setImageError(outcome.message);
      return;
    }
    setImageError(null);
    onChange({ ...values, image: outcome.image });
  };
  const descriptionMessageId = useId();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form id={formId} onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field
        label="Nombre"
        value={values.name}
        error={errors.name}
        onChange={(event) => onChange({ ...values, name: event.target.value })}
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={descriptionId} className={`${T_LABEL} text-text-secondary`}>
          Descripción
        </label>
        <textarea
          id={descriptionId}
          rows={3}
          value={values.description}
          onChange={(event) => onChange({ ...values, description: event.target.value })}
          {...(errors.description ? { "aria-invalid": true } : {})}
          aria-describedby={descriptionMessageId}
          className={cn(
            "rounded-nb-sm border-2 bg-surface p-3 text-sm text-text-primary shadow-nb-sm",
            errors.description ? "border-danger" : "border-ink",
          )}
        />
        <p
          id={descriptionMessageId}
          className={cn("flex justify-between gap-3 text-xs", errors.description ? "text-danger" : "text-text-secondary")}
        >
          <span>{errors.description ?? "Opcional."}</span>
          <span className="font-mono">
            {values.description.length}/{config.limits.descriptionMax}
          </span>
        </p>
      </div>
      {values.color ? (
        <CategoryColorField
          name={`${formId}-color`}
          legend="Color en la tienda"
          value={values.color}
          onChange={(color) => onChange({ ...values, color })}
          helper="Las cards de sus productos en la tienda toman este color."
        />
      ) : null}
      {config.kind === "category" ? (
        <div className="flex flex-col gap-1.5">
          <span className={`${T_LABEL} text-text-secondary`}>Foto en la tienda</span>
          <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-start gap-3">
            {previewUrl ? <ImageTile url={previewUrl} alt="Foto de la categoría" className="aspect-[4/5] w-full rounded-nb-sm border-2 border-ink" /> : null}
            <UploadTile
              label={previewUrl ? "Reemplazar foto" : "Subir foto"}
              hint="JPG, PNG, WEBP o AVIF · 5 MB"
              busy={uploading}
              describedBy={imageError ? imageErrorId : undefined}
              className="aspect-[4/5] w-24"
              onFiles={(files) => void pickImage(files[0] as File)}
            />
          </div>
          <p className="text-xs text-text-secondary">Sale en el mosaico de Categorías del inicio, en vertical (4:5). Opcional.</p>
          {imageError ? (
            <p id={imageErrorId} role="alert" className="text-xs text-danger">
              {imageError}
            </p>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <Notice
          variant="danger"
          title={mode === "edit" ? `No se pudo guardar la ${config.singular}` : `No se pudo crear la ${config.singular}`}
        >
          <p>{error}</p>
        </Notice>
      ) : null}
    </form>
  );
};

export type { TaxonFormProps };
export { TaxonForm };
