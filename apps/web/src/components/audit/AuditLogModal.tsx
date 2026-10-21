"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Notice } from "@/components/ui/Notice";
import { Skeleton } from "@/components/ui/Skeleton";
import { T_LABEL } from "@/components/ui/typography";
import { auditClient, type PanelAuditLog } from "@/lib/api/adminAudit";
import { isApiError } from "@/lib/api/ApiError";
import { ACTION_LABELS, ACTOR_LABELS, MODULE_LABELS } from "@/lib/audit/labels";
import { auditTarget } from "@/lib/audit/target";
import { formatLongDate, formatShortTime } from "@/lib/format";
import { AuditChanges } from "./AuditChanges";

interface AuditLogModalProps {
  /** Entry id from `?registro=`; `undefined` while closed. */
  selected: string | undefined;
  /** The page already loaded: an entry in it opens without another request. */
  items: PanelAuditLog[];
  onClose: () => void;
}

type Loaded = { id: string; entry: PanelAuditLog } | { id: string; error: string; gone: boolean };

const TITLE = "Registro de auditoría";

const Item = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-1">
    <dt className={`${T_LABEL} text-text-muted`}>{label}</dt>
    <dd className="text-sm">{children}</dd>
  </div>
);

const Detail = ({ entry }: { entry: PanelAuditLog }) => {
  const when = new Date(entry.createdAt);
  const target = auditTarget(entry);
  return (
    <div className="flex flex-col gap-6">
      <dl className="grid gap-4 sm:grid-cols-2">
        <Item label="Acción">
          <span className="font-bold">{ACTION_LABELS[entry.action]}</span>
        </Item>
        <Item label="Fecha">{`${formatLongDate(when)}, ${formatShortTime(when)}`}</Item>
        <Item label="Quién">{ACTOR_LABELS[entry.actor]}</Item>
        <Item label="Módulo">{MODULE_LABELS[entry.module]}</Item>
        {entry.targetId ? (
          <Item label="Objetivo">
            {target ? (
              <Link href={target.href} className="underline underline-offset-2">
                {target.label}
              </Link>
            ) : (
              <span className="break-all font-mono text-xs">{entry.targetId}</span>
            )}
          </Item>
        ) : null}
      </dl>
      <section className="flex flex-col gap-3">
        <h3 className={`${T_LABEL} text-text-secondary`}>Cambios</h3>
        <AuditChanges changes={entry.changes} />
      </section>
    </div>
  );
};

const ModalBody = ({ selected, items, onClose }: Omit<AuditLogModalProps, "selected"> & { selected: string }) => {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [retry, setRetry] = useState(0);
  const listed = items.find((candidate) => candidate.id === selected);

  useEffect(() => {
    if (listed) return;
    let cancelled = false;
    auditClient
      .get(selected)
      .then((entry) => {
        if (!cancelled) setLoaded({ id: selected, entry });
      })
      .catch((failure: unknown) => {
        if (cancelled) return;
        const gone = isApiError(failure) && failure.status === 404;
        const message = isApiError(failure) ? failure.message : "No se pudo cargar el registro.";
        setLoaded({ id: selected, gone, error: gone ? "El registro no existe. Puede que el enlace sea viejo." : message });
      });
    return () => {
      cancelled = true;
    };
  }, [listed, selected, retry]);

  const mine = loaded?.id === selected ? loaded : null;
  const entry = listed ?? (mine && "entry" in mine ? mine.entry : undefined);

  return (
    <Modal open onClose={onClose} title={TITLE}>
      {entry ? (
        <Detail entry={entry} />
      ) : mine && "error" in mine ? (
        <Notice variant="danger" title={mine.gone ? "Registro no encontrado" : "No se pudo cargar"}>
          <p>{mine.error}</p>
          <Button
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
      ) : (
        <div aria-busy="true" className="flex flex-col gap-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
    </Modal>
  );
};

const subscribeNothing = (): (() => void) => () => {};

/** Read-only detail of one entry. A portal the server never renders, so it waits for hydration. */
const AuditLogModal = ({ selected, ...rest }: AuditLogModalProps) => {
  const hydrated = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  if (!hydrated || !selected) return null;
  return <ModalBody key={selected} selected={selected} {...rest} />;
};

export type { AuditLogModalProps };
export { AuditLogModal };
