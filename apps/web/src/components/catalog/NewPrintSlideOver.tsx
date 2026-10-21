"use client";

import { useState } from "react";
import { PrintForm } from "@/components/prints/PrintForm";
import { SlideOver } from "@/components/ui/SlideOver";
import { useToast } from "@/components/ui/Toast";
import type { UseImageUpload } from "@/hooks/useImageUpload";
import { createPrint } from "@/lib/api/adminCatalog";
import { isApiError } from "@/lib/api/ApiError";
import type { Option, PickerPrint } from "@/lib/catalog/catalogOptions";
import { toCreateBody, type PrintFormValues } from "@/lib/prints/printForm";

interface NewPrintSlideOverProps {
  open: boolean;
  onClose: () => void;
  families: Option[];
  onCreated: (print: PickerPrint) => void;
  upload: UseImageUpload["upload"];
  uploading: boolean;
}

const GENERIC_ERROR = "Inténtalo de nuevo en un momento.";

type NewPrintFormProps = Omit<NewPrintSlideOverProps, "open">;

/** Mounted only while the panel is open, so every opening starts with an empty form. */
const NewPrintForm = ({ onClose, families, onCreated, upload, uploading }: NewPrintFormProps) => {
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (values: PrintFormValues) => {
    setSaving(true);
    setError(null);
    try {
      const print = await createPrint(toCreateBody(values));
      onCreated(print);
      toast({ variant: "success", title: `Estampa «${print.name}» creada` });
      onClose();
    } catch (failure) {
      setError(isApiError(failure) ? failure.message : GENERIC_ERROR);
    } finally {
      setSaving(false);
    }
  };

  return (
    <PrintForm
      mode="create"
      families={families}
      upload={upload}
      uploading={uploading}
      saving={saving}
      error={error}
      onSubmit={submit}
      onCancel={onClose}
    />
  );
};

/** Creates a print without leaving the product: the new one joins the picker at once. The Estampas screen has its own panel. */
const NewPrintSlideOver = ({ open, onClose, ...rest }: NewPrintSlideOverProps) => (
  <SlideOver open={open} onClose={onClose} title="Nueva estampa">
    <NewPrintForm onClose={onClose} {...rest} />
  </SlideOver>
);

export type { NewPrintSlideOverProps };
export { NewPrintSlideOver };
