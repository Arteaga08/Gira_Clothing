"use client";

import type { ImageAttrs } from "@gira/shared";
import { useId, useState, type FormEvent } from "react";
import { ImageTile } from "@/components/catalog/ImageTile";
import { UploadTile } from "@/components/catalog/UploadTile";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { SelectField } from "@/components/ui/SelectField";
import type { UseImageUpload } from "@/hooks/useImageUpload";
import { withCurrentCategory, type Option } from "@/lib/catalog/catalogOptions";
import type { PanelPrint } from "@/lib/prints/panelPrint";
import {
  toUpdateBody,
  validatePrintForm,
  type PrintFormErrors,
  type PrintFormValues,
} from "@/lib/prints/printForm";

interface PrintFormProps {
  mode: "create" | "edit";
  /** The print being edited (edit mode). */
  print?: PanelPrint;
  families: Option[];
  upload: UseImageUpload["upload"];
  uploading: boolean;
  saving: boolean;
  /** The API's own message (Spanish) or the generic one. */
  error: string | null;
  onSubmit: (values: PrintFormValues) => void | Promise<void>;
  onCancel: () => void;
}

/**
 * The print's fields, shared by "Nueva estampa" in the product editor and the
 * Estampas side panel. It owns what the operator is typing; the caller owns the
 * request. The SKU is editable only on create: every variant SKU is built from it.
 */
const PrintForm = ({ mode, print, families, upload, uploading, saving, error, onSubmit, onCancel }: PrintFormProps) => {
  const imageErrorId = useId();
  const [name, setName] = useState(print?.name ?? "");
  const [sku, setSku] = useState(print?.sku ?? "");
  const [familyId, setFamilyId] = useState(print?.family.id ?? "");
  const [image, setImage] = useState<ImageAttrs | null>(null);
  const [errors, setErrors] = useState<PrintFormErrors>({});

  const editing = mode === "edit" && print !== undefined;
  const values: PrintFormValues = { name, sku, familyId, image };
  const unchanged =
    editing && Object.keys(toUpdateBody(values, { name: print.name, familyId: print.family.id, imageUrl: print.imageUrl })).length === 0;
  const previewUrl = image?.url ?? print?.imageUrl;
  const familyOptions = editing ? withCurrentCategory(families, print.family.id, print.family.name) : families;

  const pickImage = async (file: File) => {
    const outcome = await upload(file, "prints");
    if (!outcome.ok) {
      setErrors((previous) => ({ ...previous, image: outcome.message }));
      return;
    }
    setImage(outcome.image);
    setErrors((previous) => ({ ...previous, image: undefined }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const found = validatePrintForm(values, mode);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    await onSubmit(values);
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4" noValidate>
      <Field label="Nombre" value={name} error={errors.name} onChange={(event) => setName(event.target.value)} />
      {editing ? (
        <Field
          label="SKU"
          value={sku}
          readOnly
          helper="Fijo una vez creada: las variantes ya lo usan."
          className="font-mono"
        />
      ) : (
        <Field
          label="SKU"
          value={sku}
          error={errors.sku}
          helper="Letras, números y guiones. No se podrá cambiar después."
          className="font-mono"
          onChange={(event) => setSku(event.target.value.toUpperCase())}
        />
      )}
      <SelectField
        label="Familia"
        options={[{ value: "", label: "Elige una familia" }, ...familyOptions]}
        value={familyId}
        error={errors.family}
        onChange={setFamilyId}
      />
      <div className="flex flex-col gap-1.5">
        <div className="grid grid-cols-[8rem_minmax(0,1fr)] items-start gap-3">
          {previewUrl ? (
            <ImageTile url={previewUrl} alt="Imagen de la estampa" className="aspect-square w-full rounded-nb-sm border-2 border-ink" />
          ) : null}
          <UploadTile
            label={previewUrl ? "Reemplazar imagen" : "Subir imagen"}
            hint="JPG, PNG, WEBP o AVIF · 5 MB"
            busy={uploading}
            describedBy={errors.image ? imageErrorId : undefined}
            className="aspect-square w-32"
            onFiles={(files) => void pickImage(files[0] as File)}
          />
        </div>
        {errors.image ? (
          <p id={imageErrorId} role="alert" className="text-xs text-danger">
            {errors.image}
          </p>
        ) : null}
      </div>
      {error ? (
        <Notice variant="danger" title={editing ? "No se pudo guardar la estampa" : "No se pudo crear la estampa"}>
          <p>{error}</p>
        </Notice>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" loading={saving} disabled={uploading || unchanged}>
          {editing ? "Guardar cambios" : "Crear estampa"}
        </Button>
      </div>
    </form>
  );
};

export type { PrintFormProps };
export { PrintForm };
