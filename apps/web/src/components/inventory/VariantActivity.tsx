"use client";

import { STOCK_ACTION_LABELS } from "@gira/shared";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Skeleton } from "@/components/ui/Skeleton";
import { useVariantActivity } from "@/hooks/useVariantActivity";
import { formatInteger, formatShortDateTime } from "@/lib/format";

interface VariantActivityProps {
  variantId: string;
  /** Bump after an adjustment so the history re-reads without a skeleton. */
  reloadKey: number;
}

const signed = (delta: number): string => `${delta > 0 ? "+" : "−"}${formatInteger(Math.abs(delta))}`;

/** The last stock movements of one variant: who, when, from → to, and why. */
const VariantActivity = ({ variantId, reloadKey }: VariantActivityProps) => {
  const activity = useVariantActivity(variantId, reloadKey);

  if (activity.status === "loading") {
    return (
      <div aria-busy="true" className="flex flex-col gap-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (activity.status === "error") {
    return (
      <Notice variant="danger" title="No se pudo cargar el historial">
        <p>{activity.error}</p>
        <Button variant="positive" size="sm" className="mt-2" onClick={activity.refresh}>
          Reintentar
        </Button>
      </Notice>
    );
  }

  if (activity.entries.length === 0) {
    return <p className="text-sm text-text-secondary">Todavía no hay movimientos registrados para esta variante.</p>;
  }

  return (
    <ul className="flex flex-col">
      {activity.entries.map((entry) => (
        <li key={entry.id} className="border-t border-border py-2 first:border-t-0">
          <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
            <span className="font-bold">{STOCK_ACTION_LABELS[entry.action] ?? "Ajuste"}</span>
            {entry.before !== undefined && entry.after !== undefined ? (
              <span className="font-mono font-bold">
                {formatInteger(entry.before)} → {formatInteger(entry.after)}
                {entry.delta !== undefined && entry.delta !== 0 ? ` (${signed(entry.delta)})` : ""}
              </span>
            ) : null}
          </p>
          <p className="text-2xs text-text-muted">
            {entry.actorName} · {formatShortDateTime(entry.createdAt)}
          </p>
          {entry.reason ? <p className="mt-0.5 text-xs text-text-secondary">{entry.reason}</p> : null}
        </li>
      ))}
    </ul>
  );
};

export type { VariantActivityProps };
export { VariantActivity };
