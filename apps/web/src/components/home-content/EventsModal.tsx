"use client";

import {
  EVENTS_EMPTY_MESSAGE_MAX_LENGTH,
  EVENTS_MAX_ITEMS,
  EVENT_URL_MAX_LENGTH,
  type Settings,
  type StorefrontEvent,
  type StorefrontEvents,
  type Wire,
} from "@gira/shared";
import { useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { useToast } from "@/components/ui/Toast";
import { SectionModal } from "@/components/settings/SectionModal";
import { settingsClient } from "@/lib/api/adminSettings";
import { uploadImage } from "@/lib/api/adminUploads";
import { isApiError } from "@/lib/api/ApiError";
import { validateImageFile } from "@/lib/catalog/imageFile";
import { blankEvent, eventsSignature, parseEvents } from "@/lib/settings/events";
import { EventEditor } from "./EventEditor";

interface EventsModalProps {
  events: StorefrontEvents;
  onClose: () => void;
  onSaved: (settings: Wire<Settings>) => void;
}

const GENERIC_ERROR = "No se pudieron guardar los eventos.";

/** Edits the events: the list (add, change, remove) and what the store says when none is upcoming. */
const EventsModal = ({ events, onClose, onSaved }: EventsModalProps) => {
  const { toast } = useToast();
  const formId = `events-form-${useId()}`;
  const [initial] = useState(() => eventsSignature(events));
  const [draft, setDraft] = useState<StorefrontEvents>(events);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const nextNewId = useRef(0);

  const dirty = eventsSignature(draft) !== initial;

  const update = (change: Partial<StorefrontEvents>) => {
    setError(null);
    setDraft((current) => ({ ...current, ...change }));
  };

  const changeItem = (id: string, next: StorefrontEvent) =>
    update({ items: draft.items.map((item) => (item.id === id ? next : item)) });

  const addItem = () => {
    nextNewId.current += 1;
    update({ items: [...draft.items, blankEvent(`new-${nextNewId.current}`)] });
  };

  const pickImage = async (id: string, file: File) => {
    const invalid = validateImageFile(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setUploadingId(id);
    try {
      const image = await uploadImage(file, "home");
      setDraft((current) => ({
        ...current,
        items: current.items.map((item) => (item.id === id ? { ...item, image } : item)),
      }));
    } catch (failure) {
      setError(isApiError(failure) ? failure.message : "No se pudo subir la imagen.");
    } finally {
      setUploadingId(null);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || uploadingId) return;
    const parsed = parseEvents(draft);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const settings = await settingsClient.updateEvents(parsed.events);
      toast({ variant: "success", title: "Eventos guardados" });
      onSaved(settings);
      onClose();
    } catch (failure) {
      setSaving(false);
      setError(isApiError(failure) ? failure.message : GENERIC_ERROR);
    }
  };

  return (
    <SectionModal title="Eventos" formId={formId} dirty={dirty} saving={saving} onClose={onClose}>
      <form id={formId} onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-5">
        <Notice variant="info" title="Cómo se ve">
          <p>
            El evento más cercano sale como cartel con su foto y los siguientes (hasta 4) debajo. Los eventos que ya pasaron
            dejan de mostrarse solos, no hace falta borrarlos. Los cambios pueden tardar hasta un minuto en aparecer.
          </p>
        </Notice>
        {error ? (
          <Notice variant="danger" title="No se pudo continuar">
            <p>{error}</p>
          </Notice>
        ) : null}
        {draft.items.length > 0 ? (
          <ul className="flex flex-col gap-5">
            {draft.items.map((item, index) => (
              <EventEditor
                key={item.id}
                event={item}
                index={index}
                busy={uploadingId === item.id}
                onChange={(next) => changeItem(item.id, next)}
                onReplaceImage={(file) => void pickImage(item.id, file)}
                onRemove={() => update({ items: draft.items.filter((other) => other.id !== item.id) })}
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-secondary">Aún no hay eventos guardados.</p>
        )}
        <Button
          variant="positive"
          size="sm"
          className="self-start"
          disabled={draft.items.length >= EVENTS_MAX_ITEMS}
          onClick={addItem}
        >
          Agregar evento
        </Button>
        <div className="flex flex-col gap-4 border-t-2 border-ink pt-5">
          <h3 className="font-bold text-text-primary">Cuando no hay eventos próximos</h3>
          <Field
            label="Mensaje"
            helper={`${draft.emptyMessage.length}/${EVENTS_EMPTY_MESSAGE_MAX_LENGTH} · ej. «Pronto anunciamos la siguiente parada»`}
            maxLength={EVENTS_EMPTY_MESSAGE_MAX_LENGTH}
            autoComplete="off"
            value={draft.emptyMessage}
            onChange={(event) => update({ emptyMessage: event.target.value })}
          />
          <Field
            label="Enlace del botón «Síguenos»"
            helper="Opcional · empieza con https:// · por ejemplo tu Instagram"
            maxLength={EVENT_URL_MAX_LENGTH}
            type="url"
            autoComplete="off"
            value={draft.emptyLinkUrl}
            onChange={(event) => update({ emptyLinkUrl: event.target.value })}
          />
        </div>
      </form>
    </SectionModal>
  );
};

export type { EventsModalProps };
export { EventsModal };
