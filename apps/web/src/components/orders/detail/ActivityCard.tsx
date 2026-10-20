"use client";

import type { OrderActivityEntry, Wire } from "@gira/shared";
import { useEffect, useState } from "react";
import { Notice } from "@/components/ui/Notice";
import { Skeleton } from "@/components/ui/Skeleton";
import { T_PANEL_TITLE } from "@/components/ui/typography";
import { getOrderActivity } from "@/lib/api/adminOrders";
import { formatShortDateTime } from "@/lib/format";
import { activityActorLabel, activityLabel } from "@/lib/orders/activity";

interface ActivityCardProps {
  orderId: string;
  version: number;
  cancelReason?: string | undefined;
}

/** Who did what and when. The API sends no before/after values (they can carry PII) and neither do we. */
const ActivityCard = ({ orderId, version, cancelReason }: ActivityCardProps) => {
  const [entries, setEntries] = useState<Wire<OrderActivityEntry>[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getOrderActivity(orderId)
      .then((activity) => {
        if (cancelled) return;
        setEntries(activity);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, version]);

  return (
    <section aria-labelledby="activity-title">
      <h3 id="activity-title" className={T_PANEL_TITLE}>
        Actividad
      </h3>
      {cancelReason ? (
        <p className="mt-3 text-sm">
          <strong>Motivo de cancelación:</strong> {cancelReason}
        </p>
      ) : null}
      <div className="mt-3">
        {failed ? (
          <Notice variant="warning" title="No se pudo cargar la actividad">
            Actualiza la página para intentarlo de nuevo.
          </Notice>
        ) : entries === null ? (
          <div aria-busy="true" className="flex flex-col gap-3">
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-4 w-44" />
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-text-muted">Todavía no hay actividad registrada.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {entries.map((entry, index) => (
              <li key={`${index}-${entry.createdAt}-${entry.action}`}>
                <p className="text-sm font-bold">{activityLabel(entry.action)}</p>
                <p className="font-mono text-2xs text-text-muted">
                  {activityActorLabel(entry)} · {formatShortDateTime(entry.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

export type { ActivityCardProps };
export { ActivityCard };
