"use client";

import {
  HERO_HEADLINE_MAX_LENGTH,
  HERO_HEADLINE_MAX_WORDS,
  HERO_MAX_SLIDES,
  HERO_SLIDE_SECONDS,
  type Settings,
  type StorefrontHero,
  type Wire,
} from "@gira/shared";
import { useEffect, useId, useState, type FormEvent } from "react";
import { UploadTile } from "@/components/catalog/UploadTile";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { useToast } from "@/components/ui/Toast";
import { SectionModal } from "@/components/settings/SectionModal";
import { fetchHeroProductOptions } from "@/lib/api/adminHeroProducts";
import { settingsClient } from "@/lib/api/adminSettings";
import { uploadImage } from "@/lib/api/adminUploads";
import { isApiError } from "@/lib/api/ApiError";
import { validateImageFile } from "@/lib/catalog/imageFile";
import {
  countWords,
  heroSignature,
  newSlideDraft,
  parseHero,
  toDraft,
  type HeroDraft,
  type HeroSlideDraft,
} from "@/lib/settings/hero";
import { HeroSlideEditor } from "./HeroSlideEditor";

interface HeroModalProps {
  hero: StorefrontHero;
  onClose: () => void;
  onSaved: (settings: Wire<Settings>) => void;
}

const GENERIC_ERROR = "No se pudo guardar la portada.";
const PRODUCTS_ERROR = "No se pudo cargar la lista de productos. Puedes guardar sin elegir producto.";

/** Edits the home hero: the title and up to five photos, each with its model, colours and cards. */
const HeroModal = ({ hero, onClose, onSaved }: HeroModalProps) => {
  const { toast } = useToast();
  const formId = `hero-form-${useId()}`;
  const [initial] = useState(() => heroSignature(toDraft(hero)));
  const [draft, setDraft] = useState<HeroDraft>(() => toDraft(hero));
  const [productOptions, setProductOptions] = useState<{ value: string; label: string }[]>([]);
  const [productsFailed, setProductsFailed] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
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

  const dirty = heroSignature(draft) !== initial;

  const updateSlides = (change: (slides: HeroSlideDraft[]) => HeroSlideDraft[]) => {
    setError(null);
    setDraft((current) => ({ ...current, slides: change(current.slides) }));
  };

  // `key === null` appends a new photo; otherwise it replaces the picture of that one.
  const pickImage = async (key: string | null, file: File) => {
    const invalid = validateImageFile(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setBusyKey(key ?? "new");
    try {
      const image = await uploadImage(file, "home");
      updateSlides((slides) =>
        key === null ? [...slides, newSlideDraft(image)] : slides.map((s) => (s.key === key ? { ...s, image } : s)),
      );
    } catch (failure) {
      setError(isApiError(failure) ? failure.message : "No se pudo subir la imagen.");
    } finally {
      setBusyKey(null);
    }
  };

  const move = (index: number, direction: -1 | 1) =>
    updateSlides((slides) => {
      const next = [...slides];
      const target = index + direction;
      if (target < 0 || target >= next.length) return slides;
      [next[index], next[target]] = [next[target] as HeroSlideDraft, next[index] as HeroSlideDraft];
      return next;
    });

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || busyKey) return;
    const parsed = parseHero(draft);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const settings = await settingsClient.updateHero(parsed.hero);
      toast({ variant: "success", title: "Portada actualizada" });
      onSaved(settings);
      onClose();
    } catch (failure) {
      setSaving(false);
      setError(isApiError(failure) ? failure.message : GENERIC_ERROR);
    }
  };

  const words = countWords(draft.headline);

  return (
    <SectionModal title="Portada de la tienda" formId={formId} dirty={dirty} saving={saving} onClose={onClose}>
      <form id={formId} onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-5">
        <Notice variant="info" title="Cómo funciona">
          <p>
            Las fotos suben solas y cada una se queda {HERO_SLIDE_SECONDS} segundos. El titular, el botón y las cards
            cambian con la foto. Los cambios pueden tardar hasta un minuto en aparecer.
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
        <Field
          label="Titular"
          helper={`${words}/${HERO_HEADLINE_MAX_WORDS} palabras · ${draft.headline.length}/${HERO_HEADLINE_MAX_LENGTH}`}
          maxLength={HERO_HEADLINE_MAX_LENGTH}
          autoComplete="off"
          value={draft.headline}
          onChange={(event) => {
            setError(null);
            setDraft((current) => ({ ...current, headline: event.target.value }));
          }}
        />
        <ul className="flex flex-col gap-4">
          {draft.slides.map((slide, index) => (
            <HeroSlideEditor
              key={slide.key}
              slide={slide}
              index={index}
              total={draft.slides.length}
              productOptions={productOptions}
              busy={busyKey === slide.key}
              onChange={(next) => updateSlides((slides) => slides.map((s) => (s.key === slide.key ? next : s)))}
              onReplaceImage={(file) => void pickImage(slide.key, file)}
              onMove={(direction) => move(index, direction)}
              onRemove={() => updateSlides((slides) => slides.filter((s) => s.key !== slide.key))}
            />
          ))}
        </ul>
        {draft.slides.length < HERO_MAX_SLIDES ? (
          <UploadTile
            label={draft.slides.length === 0 ? "Subir la primera foto" : "Agregar otra foto"}
            hint={`JPG, PNG, WEBP o AVIF · 5 MB · hasta ${HERO_MAX_SLIDES} fotos`}
            busy={busyKey === "new"}
            className="min-h-24"
            onFiles={(files) => void pickImage(null, files[0] as File)}
          />
        ) : null}
      </form>
    </SectionModal>
  );
};

export type { HeroModalProps };
export { HeroModal };
