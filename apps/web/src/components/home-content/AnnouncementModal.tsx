"use client";

import { ANNOUNCEMENT_MAX_LENGTH, ANNOUNCEMENT_MAX_MESSAGES, type Settings, type StorefrontAnnouncement, type Wire } from "@gira/shared";
import { Plus, Trash } from "@phosphor-icons/react/dist/ssr";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import { Notice } from "@/components/ui/Notice";
import { Toggle } from "@/components/ui/Toggle";
import { useToast } from "@/components/ui/Toast";
import { settingsClient } from "@/lib/api/adminSettings";
import { isApiError } from "@/lib/api/ApiError";
import { cleanAnnouncementMessages, parseAnnouncement } from "@/lib/settings/announcement";
import { SectionModal } from "@/components/settings/SectionModal";

interface AnnouncementModalProps {
  announcement: StorefrontAnnouncement;
  onClose: () => void;
  onSaved: (settings: Wire<Settings>) => void;
}

const GENERIC_ERROR = "No se pudo guardar la barra de anuncios.";

/** Edits the storefront marquee: an on/off switch and 1 to 5 short messages. */
const AnnouncementModal = ({ announcement, onClose, onSaved }: AnnouncementModalProps) => {
  const { toast } = useToast();
  const formId = `announcement-form-${useId()}`;
  const [enabled, setEnabled] = useState(announcement.enabled);
  const [drafts, setDrafts] = useState<string[]>(announcement.messages.length > 0 ? announcement.messages : [""]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const dirty =
    enabled !== announcement.enabled ||
    JSON.stringify(cleanAnnouncementMessages(drafts)) !== JSON.stringify(announcement.messages);

  const setDraft = (index: number, value: string) => {
    setError(null);
    setDrafts((current) => current.map((draft, i) => (i === index ? value : draft)));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const parsed = parseAnnouncement(enabled, drafts);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const settings = await settingsClient.updateAnnouncement({ enabled, messages: parsed.messages });
      toast({ variant: "success", title: enabled ? "Barra de anuncios visible" : "Barra de anuncios oculta" });
      onSaved(settings);
      onClose();
    } catch (failure) {
      setSaving(false);
      setError(isApiError(failure) ? failure.message : GENERIC_ERROR);
    }
  };

  return (
    <SectionModal title="Barra de anuncios" formId={formId} dirty={dirty} saving={saving} onClose={onClose}>
      <form id={formId} onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-5">
        <Notice variant="info" title="Cuándo se ve">
          <p>
            Los mensajes corren en bucle arriba de la tienda. Los cambios pueden tardar hasta un minuto en
            aparecer.
          </p>
        </Notice>
        {error ? (
          <Notice variant="danger" title="No se pudo guardar">
            <p>{error}</p>
          </Notice>
        ) : null}
        <Toggle checked={enabled} onChange={setEnabled} label="Mostrar la barra en la tienda" />
        <div className="flex flex-col gap-3">
          {drafts.map((draft, index) => (
            <div key={index} className="flex items-start gap-3">
              <Field
                label={`Mensaje ${index + 1}`}
                helper={`${draft.length}/${ANNOUNCEMENT_MAX_LENGTH}`}
                maxLength={ANNOUNCEMENT_MAX_LENGTH}
                autoComplete="off"
                value={draft}
                onChange={(event) => setDraft(index, event.target.value)}
                containerClassName="min-w-0 flex-1"
              />
              <IconButton
                icon={Trash}
                label={`Quitar mensaje ${index + 1}`}
                variant="danger"
                className="mt-[calc(var(--text-2xs)*1.5+0.375rem)] shrink-0"
                disabled={drafts.length === 1}
                onClick={() => setDrafts((current) => current.filter((_, i) => i !== index))}
              />
            </div>
          ))}
          <div>
            <Button variant="positive"
              size="sm"
              disabled={drafts.length >= ANNOUNCEMENT_MAX_MESSAGES}
              onClick={() => setDrafts((current) => [...current, ""])}
            >
              <Plus aria-hidden="true" /> Agregar mensaje
            </Button>
          </div>
        </div>
      </form>
    </SectionModal>
  );
};

export type { AnnouncementModalProps };
export { AnnouncementModal };
