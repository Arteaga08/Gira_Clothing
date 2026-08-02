import { NotificationChannelKind, NotificationType, type OutboxHealth, type Wire } from "@gira/shared";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { cn } from "@/lib/cn";
import { formatInteger, formatShortTime } from "@/lib/format";

interface OutboxHealthPanelProps {
  health: Wire<OutboxHealth>;
}

/**
 * The only enum family without labels in @gira/shared — tsc's `Record`
 * requirement covers the same ground `ORDER_STATUS_LABELS` covers there: drop
 * a member and the build fails instead of a blank string reaching the admin.
 */
const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  [NotificationType.ORDER_CONFIRMATION]: "confirmación de pedido",
  [NotificationType.ORDER_PREPARING]: "pedido en preparación",
  [NotificationType.ORDER_SHIPPED]: "pedido enviado",
  [NotificationType.TEAM_ORDER_PAID]: "aviso de pedido pagado",
  [NotificationType.TEAM_PAYMENT_FAILED]: "aviso de pago fallido",
  [NotificationType.TEAM_SHIPMENT_INCIDENT]: "aviso de incidencia de envío",
  [NotificationType.TEAM_PAYMENT_NEEDS_REVIEW]: "aviso de pago por revisar",
};

const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannelKind, string> = {
  [NotificationChannelKind.EMAIL]: "correo",
  [NotificationChannelKind.TEAM]: "equipo",
};

interface TileProps {
  label: string;
  count: number;
  danger?: boolean;
}

const Tile = ({ label, count, danger = false }: TileProps) => (
  <div
    className={cn(
      "rounded-nb-sm border-2 border-ink p-3",
      danger && count > 0 ? "bg-[var(--status-disputed)]" : "bg-surface-raised",
    )}
  >
    <p className="font-mono text-xl font-bold leading-none">{formatInteger(count)}</p>
    <p className="mt-2 text-xs font-semibold text-text-secondary">{label}</p>
  </div>
);

/**
 * No "Estancadas" tile: `OutboxHealth.stale` is hardcoded to 0 in
 * notificationService.ts (a reserved field, no distinct queryable state yet)
 * — a metric that always reads zero is noise, not a signal.
 * No "Reintentar fallidas" button either: the endpoint doesn't exist yet
 * (notificationRoutes.ts mounts only GET /health).
 */
const OutboxHealthPanel = ({ health }: OutboxHealthPanelProps) => {
  const latestFailure = health.failedSample[0];

  return (
    <Panel title="Salud de notificaciones" hint="Cola transaccional (correo y equipo)">
      <div className="grid grid-cols-3 gap-3">
        <Tile label="Enviadas" count={health.sent} />
        <Tile label="Pendientes" count={health.pending} />
        <Tile label="Fallidas" count={health.failed} danger />
      </div>
      {latestFailure ? (
        <Notice
          variant="warning"
          title={`${formatInteger(health.failed)} notificación${health.failed === 1 ? "" : "es"} fallida${health.failed === 1 ? "" : "s"} tras ${latestFailure.attempts} intentos`}
          className="mt-4"
        >
          <span className="font-mono">{NOTIFICATION_TYPE_LABELS[latestFailure.type]}</span> · canal{" "}
          {NOTIFICATION_CHANNEL_LABELS[latestFailure.channel]}
          {latestFailure.lastError ? <> · último error: &ldquo;{latestFailure.lastError}&rdquo;</> : null}
          {health.oldestPendingAt ? (
            <p className="mt-1">
              La más antigua en cola espera desde las {formatShortTime(new Date(health.oldestPendingAt))}.
            </p>
          ) : null}
        </Notice>
      ) : null}
    </Panel>
  );
};

export { OutboxHealthPanel };
export type { OutboxHealthPanelProps };
