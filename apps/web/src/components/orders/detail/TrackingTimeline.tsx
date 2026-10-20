"use client";

import type { AdminOrderTracking, Wire } from "@gira/shared";
import { SHIPMENT_TRACKING_STATUS_LABELS } from "@gira/shared";
import { useEffect, useState } from "react";
import { Notice } from "@/components/ui/Notice";
import { Skeleton } from "@/components/ui/Skeleton";
import { getOrderTracking } from "@/lib/api/adminOrders";
import { formatShortDateTime } from "@/lib/format";

interface TrackingTimelineProps {
  orderId: string;
  /** Bumped after every action so the events are read again. */
  version: number;
}

type Events = Wire<AdminOrderTracking>["events"];

const byNewest = (events: Events): Events =>
  [...events].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

/** Carrier events, newest first. Loads on open: the order itself only carries the latest status. */
const TrackingTimeline = ({ orderId, version }: TrackingTimelineProps) => {
  const [events, setEvents] = useState<Events | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getOrderTracking(orderId)
      .then((tracking) => {
        if (cancelled) return;
        setEvents(byNewest(tracking.events));
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, version]);

  if (failed) {
    return (
      <Notice variant="warning" title="No se pudo cargar el rastreo">
        Actualiza la página para intentarlo de nuevo.
      </Notice>
    );
  }
  if (events === null) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-40" />
      </div>
    );
  }
  if (events.length === 0) return <p className="text-sm text-text-muted">Aún no hay eventos de rastreo.</p>;

  return (
    <ol aria-label="Eventos de rastreo" className="flex flex-col">
      {events.map((event, index) => (
        <li
          key={`${index}-${event.occurredAt}-${event.rawStatus}`}
          className="relative grid grid-cols-[20px_1fr] gap-3 pb-4 last:pb-0"
        >
          {index < events.length - 1 ? (
            <span aria-hidden="true" className="absolute bottom-0 left-[7px] top-4 w-0.5 bg-ink" />
          ) : null}
          <span
            aria-hidden="true"
            className={`mt-1 h-4 w-4 rounded-full border-2 border-ink ${index === 0 ? "bg-ink" : "bg-surface"}`}
          />
          <div className="min-w-0">
            <p className="text-sm font-bold">{SHIPMENT_TRACKING_STATUS_LABELS[event.status]}</p>
            {event.description ? <p className="text-sm">{event.description}</p> : null}
            <p className="font-mono text-2xs text-text-muted">
              {[event.location, formatShortDateTime(event.occurredAt)].filter(Boolean).join(" · ")}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
};

export type { TrackingTimelineProps };
export { TrackingTimeline };
