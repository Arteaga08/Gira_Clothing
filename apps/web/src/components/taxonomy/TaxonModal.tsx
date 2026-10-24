"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { Notice } from "@/components/ui/Notice";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useImageUpload } from "@/hooks/useImageUpload";
import { useTaxonSave } from "@/hooks/useTaxonSave";
import { isApiError } from "@/lib/api/ApiError";
import type { TaxonConfig } from "@/lib/taxonomy/config";
import type { PanelTaxon } from "@/lib/taxonomy/panelTaxon";
import { toUpdateBody, validateTaxonForm, type TaxonFormErrors, type TaxonFormValues } from "@/lib/taxonomy/taxonForm";
import { RetireTaxonSection } from "./RetireTaxonSection";
import { TaxonForm } from "./TaxonForm";

interface TaxonModalProps {
  config: TaxonConfig;
  /** `"nueva"` for the create form, a record id for an existing one, `undefined` while closed. */
  selected: string | undefined;
  /** The page already loaded: the modal opens from it without another request. */
  items: PanelTaxon[];
  onClose: () => void;
  /** The list changed (create / edit / retire / reactivate): refresh it. The modal closes itself. */
  onChanged: () => void;
}

interface BodyProps extends Omit<TaxonModalProps, "selected"> {
  selected: string;
}

type Loaded = { id: string; taxon: PanelTaxon } | { id: string; error: string; gone: boolean };

const GENERIC_LOAD_ERROR = "No se pudo cargar el registro.";
const FORM_ID = "taxon-form";

const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

interface EditorProps {
  config: TaxonConfig;
  taxon: PanelTaxon | undefined;
  onClose: () => void;
  onChanged: () => void;
}

/** The form and the retire guard of one record (or the empty form). Mounted once the record is in hand, so its fields start from it. */
const Editor = ({ config, taxon, onClose, onChanged }: EditorProps) => {
  const { toast } = useToast();
  const save = useTaxonSave(config);
  const images = useImageUpload();
  const formId = `${FORM_ID}-${useId()}`;
  const [values, setValues] = useState<TaxonFormValues>({
    name: taxon?.name ?? "",
    description: taxon?.description ?? "",
    color: taxon ? taxon.color : config.kind === "category" ? "bone" : null,
    image: null,
  });
  const [errors, setErrors] = useState<TaxonFormErrors>({});
  // The hook holds one error; this says which action it belongs to so it shows in one place only.
  const [source, setSource] = useState<"form" | "retire">("form");

  const [discarding, setDiscarding] = useState(false);
  // A request that outlives the modal (back button, another row opened) must not close whatever is open now.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const editing = taxon !== undefined;
  const baseline = taxon ?? { name: "", description: "", color: values.color === null ? null : "bone" };
  const dirty =
    values.name.trim() !== baseline.name ||
    values.description.trim() !== baseline.description.trim() ||
    values.color !== baseline.color ||
    values.image != null;
  const unchanged = editing && Object.keys(toUpdateBody(values, baseline)).length === 0;

  const finish = (title: string) => {
    toast({ variant: "success", title });
    onChanged();
    if (alive.current) onClose();
  };

  // Escape, the X and the veil all land here: not while a request is running, and not over unsaved typing without asking.
  const requestClose = () => {
    if (save.saving) return;
    if (dirty) setDiscarding(true);
    else onClose();
  };

  const submit = async () => {
    if (save.saving) return;
    const found = validateTaxonForm(values, config.limits);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSource("form");
    const name = values.name.trim();
    if (!editing) {
      if (await save.create(values)) finish(`${capitalize(config.singular)} «${name}» creada`);
      return;
    }
    if (await save.update(taxon.id, values, taxon)) finish(`${capitalize(config.singular)} «${name}» guardada`);
  };

  const footer = (
    <>
      <Button variant="danger" onClick={requestClose} disabled={save.saving || images.busy}>
        Cancelar
      </Button>
      <Button type="submit" form={formId} variant="primary" loading={save.saving} disabled={unchanged || images.busy}>
        {editing ? "Guardar cambios" : `Crear ${config.singular}`}
      </Button>
    </>
  );

  return (
    <Modal open onClose={requestClose} title={taxon?.name ?? config.newLabel} footer={footer}>
      <div className="flex flex-col gap-6">
        <TaxonForm
          formId={formId}
          config={config}
          mode={editing ? "edit" : "create"}
          values={values}
          savedImageUrl={taxon?.imageUrl}
          upload={images.upload}
          uploading={images.busy}
          errors={errors}
          error={source === "form" ? save.error : null}
          onChange={setValues}
          onSubmit={() => void submit()}
        />
        {editing ? (
          <RetireTaxonSection
            config={config}
            taxon={taxon}
            error={source === "retire" ? save.error : null}
            onRetire={async () => {
              setSource("retire");
              const done = await save.retire(taxon.id);
              if (done) finish(`${capitalize(config.singular)} «${taxon.name}» retirada`);
              return done;
            }}
            onReactivate={async () => {
              setSource("retire");
              const done = await save.reactivate(taxon.id);
              if (done) finish(`${capitalize(config.singular)} «${taxon.name}» reactivada`);
              return done;
            }}
          />
        ) : null}
      </div>
      <ConfirmDialog
        open={discarding}
        tone="danger"
        title="¿Descartar los cambios?"
        description="Lo que escribiste no se ha guardado."
        confirmLabel="Descartar"
        onCancel={() => setDiscarding(false)}
        onConfirm={() => {
          setDiscarding(false);
          onClose();
        }}
      />
    </Modal>
  );
};

/** Mounted only while the modal is open and keyed by the selection, so every opening starts clean. */
const ModalBody = ({ config, selected, items, onClose, onChanged }: BodyProps) => {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [retry, setRetry] = useState(0);

  const creating = selected === "nueva";
  const listed = creating ? undefined : items.find((candidate) => candidate.id === selected);
  const needsFetch = !creating && !listed;

  useEffect(() => {
    if (!needsFetch) return;
    let cancelled = false;
    config.client
      .get(selected)
      .then((taxon) => {
        if (!cancelled) setLoaded({ id: selected, taxon });
      })
      .catch((failure: unknown) => {
        if (cancelled) return;
        const gone = isApiError(failure) && failure.status === 404;
        setLoaded({
          id: selected,
          gone,
          error: gone
            ? `La ${config.singular} ya no existe. Puede que la hayan eliminado o que el enlace sea viejo.`
            : isApiError(failure)
              ? failure.message
              : GENERIC_LOAD_ERROR,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [config, needsFetch, selected, retry]);

  if (creating) return <Editor config={config} taxon={undefined} onClose={onClose} onChanged={onChanged} />;

  const mine = loaded?.id === selected ? loaded : null;
  const taxon = listed ?? (mine && "taxon" in mine ? mine.taxon : undefined);

  if (taxon) return <Editor config={config} taxon={taxon} onClose={onClose} onChanged={onChanged} />;

  if (mine && "error" in mine) {
    // A 404 will not heal on retry: the only way out is to close.
    return (
      <Modal key="error" open onClose={onClose} title={capitalize(config.singular)}>
        <Notice variant="danger" title={mine.gone ? `${capitalize(config.singular)} no encontrada` : "No se pudo cargar"}>
          <p>{mine.error}</p>
          <Button variant={mine.gone ? "danger" : "positive"}
            size="sm"
            className="mt-2"
            onClick={() => {
              if (mine.gone) {
                onClose();
                return;
              }
              setLoaded(null);
              setRetry((count) => count + 1);
            }}
          >
            {mine.gone ? "Cerrar" : "Reintentar"}
          </Button>
        </Notice>
      </Modal>
    );
  }

  return (
    <Modal key="loading" open onClose={onClose} title={capitalize(config.singular)}>
      <div aria-busy="true" className="flex flex-col gap-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </Modal>
  );
};

const subscribeNothing = (): (() => void) => () => {};

/** The modal of the Familias / Categorías screens: create, edit, retire and reactivate one record without leaving the list. */
const TaxonModal = ({ selected, ...rest }: TaxonModalProps) => {
  // The modal is a portal the server never renders. Opened from the URL (`?familia=`) it would exist on the
  // first client render and break hydration, so it waits until the page is hydrated.
  const hydrated = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  if (!hydrated || !selected) return null;
  return <ModalBody key={selected} selected={selected} {...rest} />;
};

export type { TaxonModalProps };
export { TaxonModal };
