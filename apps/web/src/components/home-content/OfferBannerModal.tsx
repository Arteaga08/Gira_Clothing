"use client";

import {
  OFFER_ALT_MAX_LENGTH,
  OFFER_BUTTON_MAX_LENGTH,
  OFFER_MESSAGE_MAX_LENGTH,
  type Settings,
  type StorefrontOfferBanner,
  type Wire,
} from "@gira/shared";
import { useEffect, useId, useState, type FormEvent } from "react";
import { ImageTile } from "@/components/catalog/ImageTile";
import { UploadTile } from "@/components/catalog/UploadTile";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { SelectField } from "@/components/ui/SelectField";
import { Toggle } from "@/components/ui/Toggle";
import { useToast } from "@/components/ui/Toast";
import { T_LABEL } from "@/components/ui/typography";
import { SectionModal } from "@/components/settings/SectionModal";
import { fetchHeroProductOptions } from "@/lib/api/adminHeroProducts";
import { settingsClient } from "@/lib/api/adminSettings";
import { uploadImage } from "@/lib/api/adminUploads";
import { isApiError } from "@/lib/api/ApiError";
import { validateImageFile } from "@/lib/catalog/imageFile";
import { offerBannerSignature, parseOfferBanner } from "@/lib/settings/offerBanner";

interface OfferBannerModalProps {
  banner: StorefrontOfferBanner;
  onClose: () => void;
  onSaved: (settings: Wire<Settings>) => void;
}

const GENERIC_ERROR = "No se pudo guardar el banner de ofertas.";
const PRODUCTS_ERROR = "No se pudo cargar la lista de productos. Puedes guardar sin elegir producto.";
const NO_PRODUCT = { value: "", label: "Ir a la tienda (sin producto)" };

/** Edits the offer banner: its switch, photo, phrase, button text and the model the button leads to. */
const OfferBannerModal = ({ banner, onClose, onSaved }: OfferBannerModalProps) => {
  const { toast } = useToast();
  const formId = `offer-banner-form-${useId()}`;
  const [initial] = useState(() => offerBannerSignature(banner));
  const [draft, setDraft] = useState<StorefrontOfferBanner>(banner);
  const [productOptions, setProductOptions] = useState<{ value: string; label: string }[]>([]);
  const [productsFailed, setProductsFailed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchHeroProductOptions()
      .then((options) => {
        if (!cancelled) setProductOptions(options);
      })
      .catch(() => {
        if (!cancelled) setProductsFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = offerBannerSignature(draft) !== initial;

  const update = (change: Partial<StorefrontOfferBanner>) => {
    setError(null);
    setDraft((current) => ({ ...current, ...change }));
  };

  const pickImage = async (file: File) => {
    const invalid = validateImageFile(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      update({ image: await uploadImage(file, "home") });
    } catch (failure) {
      setError(isApiError(failure) ? failure.message : "No se pudo subir la imagen.");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || uploading) return;
    const parsed = parseOfferBanner(draft);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const settings = await settingsClient.updateOfferBanner(parsed.banner);
      toast({ variant: "success", title: parsed.banner.enabled ? "Banner de ofertas visible" : "Banner de ofertas oculto" });
      onSaved(settings);
      onClose();
    } catch (failure) {
      setSaving(false);
      setError(isApiError(failure) ? failure.message : GENERIC_ERROR);
    }
  };

  return (
    <SectionModal title="Banner de ofertas" formId={formId} dirty={dirty} saving={saving} onClose={onClose}>
      <form id={formId} onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-5">
        <Notice variant="info" title="Cómo se ve">
          <p>
            La foto ocupa todo el ancho, la frase corre en bucle encima y el botón lleva al producto elegido o a la tienda. Usa una foto horizontal;
            en el celular se recorta a los lados. Los cambios pueden tardar hasta un minuto en aparecer.
          </p>
        </Notice>
        {error ? (
          <Notice variant="danger" title="No se pudo continuar">
            <p>{error}</p>
          </Notice>
        ) : null}
        {productsFailed ? (
          <Notice variant="warning" title="Productos no disponibles">
            <p>{PRODUCTS_ERROR}</p>
          </Notice>
        ) : null}
        <Toggle checked={draft.enabled} onChange={(enabled) => update({ enabled })} label="Mostrar el banner en la tienda" />
        <div className="flex flex-col gap-2">
          <span className={T_LABEL}>Foto</span>
          {draft.image ? (
            <ImageTile
              url={draft.image.url}
              alt={draft.alt || "Foto del banner de ofertas"}
              className="aspect-[16/6] w-full rounded-nb-sm border-2 border-ink object-cover"
            />
          ) : null}
          <UploadTile
            label={draft.image ? "Cambiar foto" : "Subir foto"}
            hint="JPG, PNG, WEBP o AVIF · 5 MB · horizontal"
            busy={uploading}
            className="min-h-20"
            onFiles={(files) => void pickImage(files[0] as File)}
          />
        </div>
        <Field
          label="Descripción de la foto"
          helper={`Para lectores de pantalla · ${draft.alt.length}/${OFFER_ALT_MAX_LENGTH}`}
          maxLength={OFFER_ALT_MAX_LENGTH}
          autoComplete="off"
          value={draft.alt}
          onChange={(event) => update({ alt: event.target.value })}
        />
        <Field
          label="Frase que corre"
          helper={`${draft.message.length}/${OFFER_MESSAGE_MAX_LENGTH}`}
          maxLength={OFFER_MESSAGE_MAX_LENGTH}
          autoComplete="off"
          value={draft.message}
          onChange={(event) => update({ message: event.target.value })}
        />
        <Field
          label="Texto del botón"
          helper={`${draft.buttonLabel.length}/${OFFER_BUTTON_MAX_LENGTH}`}
          maxLength={OFFER_BUTTON_MAX_LENGTH}
          autoComplete="off"
          value={draft.buttonLabel}
          onChange={(event) => update({ buttonLabel: event.target.value })}
        />
        <SelectField
          label="Producto al que lleva"
          options={[NO_PRODUCT, ...productOptions]}
          value={draft.productId ?? ""}
          onChange={(productId) => update({ productId: productId || null })}
          helper="Si no eliges uno, el botón lleva a la tienda."
        />
      </form>
    </SectionModal>
  );
};

export type { OfferBannerModalProps };
export { OfferBannerModal };
