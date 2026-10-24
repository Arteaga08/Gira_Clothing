"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Skeleton } from "@/components/ui/Skeleton";
import { SlideOver } from "@/components/ui/SlideOver";
import { useToast } from "@/components/ui/Toast";
import { useImageUpload } from "@/hooks/useImageUpload";
import { usePrintSave } from "@/hooks/usePrintSave";
import { getPrint } from "@/lib/api/adminPrints";
import { isApiError } from "@/lib/api/ApiError";
import type { Option } from "@/lib/catalog/catalogOptions";
import type { PanelPrint } from "@/lib/prints/panelPrint";
import { baselineFromPrint, type PrintFormValues } from "@/lib/prints/printForm";
import { PrintForm } from "./PrintForm";
import { RetirePrintSection } from "./RetirePrintSection";

interface PrintSlideOverProps {
  /** `"nueva"` for the create form, a print id for an existing one, `undefined` while closed. */
  selected: string | undefined;
  /** The page of prints already loaded: the panel opens from it without another request. */
  prints: PanelPrint[];
  families: Option[];
  onClose: () => void;
  /** The list changed (create / edit / retire / reactivate): refresh it. The panel closes itself. */
  onChanged: () => void;
}

interface PanelBodyProps extends Omit<PrintSlideOverProps, "selected"> {
  selected: string;
}

type Loaded = { id: string; print: PanelPrint } | { id: string; error: string; gone: boolean };

const GENERIC_LOAD_ERROR = "No se pudo cargar la estampa.";
const GONE_MESSAGE = "La estampa ya no existe. Puede que la hayan eliminado o que el enlace sea viejo.";

/** Mounted only while the panel is open and keyed by the selection, so every opening starts clean. */
const PanelBody = ({ selected, prints, families, onClose, onChanged }: PanelBodyProps) => {
  const { toast } = useToast();
  const save = usePrintSave();
  const { upload, busy: uploading } = useImageUpload();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [retry, setRetry] = useState(0);
  // The hook holds one error; this says which action it belongs to so it shows in one place only.
  const [source, setSource] = useState<"form" | "retire">("form");

  const creating = selected === "nueva";
  const listed = creating ? undefined : prints.find((candidate) => candidate.id === selected);
  const needsFetch = !creating && !listed;

  useEffect(() => {
    if (!needsFetch) return;
    let cancelled = false;
    getPrint(selected)
      .then((print) => {
        if (!cancelled) setLoaded({ id: selected, print });
      })
      .catch((failure: unknown) => {
        if (cancelled) return;
        const gone = isApiError(failure) && failure.status === 404;
        setLoaded({ id: selected, gone, error: gone ? GONE_MESSAGE : isApiError(failure) ? failure.message : GENERIC_LOAD_ERROR });
      });
    return () => {
      cancelled = true;
    };
  }, [needsFetch, selected, retry]);

  const finish = (title: string) => {
    toast({ variant: "success", title });
    onChanged();
    onClose();
  };

  if (creating) {
    const submit = async (values: PrintFormValues) => {
      setSource("form");
      if (await save.create(values)) finish(`Estampa «${values.name.trim()}» creada`);
    };
    return (
      <PrintForm
        mode="create"
        families={families}
        upload={upload}
        uploading={uploading}
        saving={save.saving}
        error={save.error}
        onSubmit={submit}
        onCancel={onClose}
      />
    );
  }

  const mine = loaded?.id === selected ? loaded : null;
  const print = listed ?? (mine && "print" in mine ? mine.print : undefined);

  if (!print) {
    if (mine && "error" in mine) {
      // A 404 will not heal on retry: the only way out is to close.
      return (
        <Notice variant="danger" title={mine.gone ? "Estampa no encontrada" : "No se pudo cargar la estampa"}>
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
      );
    }
    return (
      <div aria-busy="true" className="flex flex-col gap-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const submit = async (values: PrintFormValues) => {
    const baseline = baselineFromPrint(print);
    setSource("form");
    if (await save.update(print.id, values, baseline)) finish(`Estampa «${values.name.trim()}» guardada`);
  };

  return (
    <div className="flex flex-col gap-6">
      <PrintForm
        mode="edit"
        print={print}
        families={families}
        upload={upload}
        uploading={uploading}
        saving={save.saving}
        error={source === "form" ? save.error : null}
        onSubmit={submit}
        onCancel={onClose}
      />
      <RetirePrintSection
        print={print}
        error={source === "retire" ? save.error : null}
        onRetire={async () => {
          setSource("retire");
          const done = await save.retire(print.id);
          if (done) finish(`Estampa «${print.name}» retirada`);
          return done;
        }}
        onReactivate={async () => {
          setSource("retire");
          const done = await save.reactivate(print.id);
          if (done) finish(`Estampa «${print.name}» reactivada`);
          return done;
        }}
      />
    </div>
  );
};

const subscribeNothing = (): (() => void) => () => {};

/** The side panel of the Estampas screen: create, edit, retire and reactivate one print without leaving the list. */
const PrintSlideOver = ({ selected, prints, ...rest }: PrintSlideOverProps) => {
  // The panel is a portal the server never renders. Opened from the URL (`?estampa=`) it would exist on the
  // first client render and break hydration, so it waits until the page is hydrated.
  const hydrated = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  if (!hydrated) return null;

  const listed = selected && selected !== "nueva" ? prints.find((candidate) => candidate.id === selected) : undefined;
  const title = selected === "nueva" ? "Nueva estampa" : (listed?.name ?? "Estampa");

  return (
    <SlideOver open={selected !== undefined} onClose={rest.onClose} title={title}>
      {selected ? <PanelBody key={selected} selected={selected} prints={prints} {...rest} /> : null}
    </SlideOver>
  );
};

export type { PrintSlideOverProps };
export { PrintSlideOver };
