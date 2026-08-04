import { NotificationChannelKind, NotificationType, type OutboxHealth, type Wire } from "@gira/shared";
import { MetricTile } from "@/components/ui/MetricTile";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
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
        <MetricTile label="Enviadas" count={formatInteger(health.sent)} />
        <MetricTile label="Pendientes" count={formatInteger(health.pending)} />
        <MetricTile
          label="Fallidas"
          count={formatInteger(health.failed)}
          level={health.failed > 0 ? "danger" : "clear"}
        />
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
