"use client";

import type { ImageAttrs } from "@gira/shared";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { SelectField } from "@/components/ui/SelectField";
import { SlideOver } from "@/components/ui/SlideOver";
import { useToast } from "@/components/ui/Toast";
import type { UseImageUpload } from "@/hooks/useImageUpload";
import { createPrint } from "@/lib/api/adminCatalog";
import { isApiError } from "@/lib/api/ApiError";
import type { Option, PickerPrint } from "@/lib/catalog/catalogOptions";
import { ImageTile } from "./ImageTile";
import { UploadTile } from "./UploadTile";

interface NewPrintSlideOverProps {
  open: boolean;
  onClose: () => void;
  families: Option[];
  onCreated: (print: PickerPrint) => void;
  upload: UseImageUpload["upload"];
  uploading: boolean;
}

type PrintFormErrors = {
  name?: string | undefined;
  sku?: string | undefined;
  family?: string | undefined;
  image?: string | undefined;
};

const SKU_PATTERN = /^[A-Z0-9-]{2,24}$/;
const GENERIC_ERROR = "Inténtalo de nuevo en un momento.";

type NewPrintFormProps = Omit<NewPrintSlideOverProps, "open">;

/** Mounted only while the panel is open, so every opening starts with an empty form. */
const NewPrintForm = ({ onClose, families, onCreated, upload, uploading }: NewPrintFormProps) => {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [familyId, setFamilyId] = useState("");
  const [image, setImage] = useState<ImageAttrs | null>(null);
  const [errors, setErrors] = useState<PrintFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

    const trimmedName = name.trim();
    const found: PrintFormErrors = {};
    if (trimmedName.length < 2 || trimmedName.length > 80) found.name = "El nombre debe tener entre 2 y 80 caracteres.";
    if (!SKU_PATTERN.test(sku.trim())) found.sku = "El SKU debe tener de 2 a 24 caracteres: letras, números y guiones.";
    if (!familyId) found.family = "Elige una familia.";
    if (!image) found.image = "Sube la imagen de la estampa.";
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0 || !image) return;

    setSaving(true);
    try {
      const print = await createPrint({ name: trimmedName, sku: sku.trim(), family: familyId, image });
      onCreated(print);
      toast({ variant: "success", title: `Estampa «${print.name}» creada` });
      onClose();
    } catch (failure) {
      setFormError(isApiError(failure) ? failure.message : GENERIC_ERROR);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4" noValidate>
      <Field label="Nombre" value={name} error={errors.name} onChange={(event) => setName(event.target.value)} />
      <Field
        label="SKU"
        value={sku}
        error={errors.sku}
        helper="Letras, números y guiones. No se puede cambiar después sin afectar etiquetas."
        className="font-mono"
        onChange={(event) => setSku(event.target.value.toUpperCase())}
      />
      <SelectField
        label="Familia"
        options={[{ value: "", label: "Elige una familia" }, ...families]}
        value={familyId}
        error={errors.family}
        onChange={(event) => setFamilyId(event.target.value)}
      />
      <div className="flex flex-col gap-1.5">
        <div className="grid grid-cols-[8rem_minmax(0,1fr)] items-start gap-3">
          {image ? (
            <ImageTile url={image.url} alt="Imagen de la estampa" className="aspect-square w-full rounded-nb-sm border-2 border-ink" />
          ) : null}
          <UploadTile
            label={image ? "Reemplazar imagen" : "Subir imagen"}
            hint="JPG, PNG, WEBP o AVIF · 5 MB"
            busy={uploading}
            className="aspect-square w-32"
            onFiles={(files) => void pickImage(files[0] as File)}
          />
        </div>
        {errors.image ? (
          <p role="alert" className="text-xs text-danger">
            {errors.image}
          </p>
        ) : null}
      </div>
      {formError ? (
        <Notice variant="danger" title="No se pudo crear la estampa">
          <p>{formError}</p>
        </Notice>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" loading={saving} disabled={uploading}>
          Crear estampa
        </Button>
      </div>
    </form>
  );
};

/** Creates a print without leaving the product: the new one joins the picker at once. The full Estampas screen is M11b. */
const NewPrintSlideOver = ({ open, onClose, ...rest }: NewPrintSlideOverProps) => (
  <SlideOver open={open} onClose={onClose} title="Nueva estampa">
    <NewPrintForm onClose={onClose} {...rest} />
  </SlideOver>
);

export type { NewPrintSlideOverProps };
export { NewPrintSlideOver };
